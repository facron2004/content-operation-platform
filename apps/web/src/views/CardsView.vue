<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  listCardBatchOptions,
  listCards,
  type RedemptionCard
} from '../services/api/gap-center.api';

const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<RedemptionCard[]>([]);
const batches = ref<Array<{ batchId: string; batchNo: string; name: string }>>([]);
const search = ref('');
const status = ref('');
const batchId = ref('');

function statusLabel(value: string) {
  return (
    {
      unused: '未激活',
      active: '可兑换',
      frozen: '已冻结',
      redeemed: '已兑换',
      expired: '已过期'
    } as Record<string, string>
  )[value] || value;
}

function statusType(value: string) {
  return value === 'redeemed'
    ? 'success'
    : value === 'frozen' || value === 'expired'
      ? 'danger'
      : value === 'active'
        ? 'primary'
        : 'info';
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const [cardData, batchData] = await Promise.all([
      listCards({
        search: search.value.trim() || undefined,
        status: status.value || undefined,
        batchId: batchId.value || undefined,
        page: 1,
        pageSize: 100
      }),
      listCardBatchOptions()
    ]);
    items.value = cardData.items;
    batches.value = batchData;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '卡密列表加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => void reload());
</script>

<template>
  <section v-loading="loading" class="page-stack gap-page">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">刷新</el-button>
      <span class="readonly-note">订单卡券数据仅供查看</span>
    </div>
    <ErrorAlert :message="error" />
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">REDEMPTION CARDS</p>
          <h2>卡密列表</h2>
        </div>
        <span class="section-meta">{{ items.length }} 条</span>
      </div>
      <div class="gap-toolbar">
        <el-input v-model="search" clearable placeholder="搜索卡号" @keyup.enter="reload" />
        <el-select v-model="batchId" clearable filterable placeholder="所属批次" @change="reload">
          <el-option
            v-for="batch in batches"
            :key="batch.batchId"
            :label="`${batch.name} · ${batch.batchNo}`"
            :value="batch.batchId"
          />
        </el-select>
        <el-select v-model="status" clearable placeholder="状态" @change="reload">
          <el-option
            v-for="value in ['unused', 'active', 'frozen', 'redeemed', 'expired']"
            :key="value"
            :label="statusLabel(value)"
            :value="value"
          />
        </el-select>
        <el-button type="primary" @click="reload">查询</el-button>
      </div>
      <el-table :data="items" row-key="cardId">
        <el-table-column label="卡号" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.cardNo }}</strong>
            <small class="muted">密钥尾号 {{ row.secretHint }}</small>
          </template>
        </el-table-column>
        <el-table-column label="批次" min-width="170">
          <template #default="{ row }">
            {{ row.batchName || '—' }}
            <small class="muted">{{ row.batchNo || row.batchId }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="statusType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="兑换关联" min-width="180">
          <template #default="{ row }">
            {{ row.memberId || '未关联用户' }}
            <small class="muted">{{ row.redeemedOrderId || '未关联订单' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="150">
          <template #default="{ row }">{{ date(row.validEndAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无卡密" />
    </section>
  </section>
</template>

<style scoped>
.gap-page {
  min-width: 0;
}
.gap-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 16px 0;
}
.gap-toolbar .el-input {
  width: 220px;
  max-width: 100%;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.section-heading h2 {
  margin: 4px 0 0;
}
.section-meta,
.muted,
.readonly-note {
  color: var(--muted);
  font-size: 12px;
}
.muted {
  display: block;
  margin-top: 4px;
}
</style>

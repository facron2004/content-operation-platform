<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { listCardBatches, type CardBatch } from '../services/api/gap-center.api';

const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<CardBatch[]>([]);

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '长期';
}

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const result = await listCardBatches({ page: 1, pageSize: 100 });
    items.value = result.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '卡券批次加载失败';
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
          <p class="eyebrow">CARD INVENTORY</p>
          <h2>批次列表</h2>
        </div>
        <span class="section-meta">{{ items.length }} 条</span>
      </div>
      <el-table :data="items" row-key="batchId">
        <el-table-column label="批次" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small class="muted">{{ row.batchNo }}</small>
          </template>
        </el-table-column>
        <el-table-column label="兑换商品" min-width="150">
          <template #default="{ row }">{{ row.packageId || '未绑定商品' }}</template>
        </el-table-column>
        <el-table-column label="数量" width="100">
          <template #default="{ row }">{{ row.quantity }}</template>
        </el-table-column>
        <el-table-column label="状态分布" min-width="210">
          <template #default="{ row }">
            <div class="tag-list">
              <el-tag v-for="(count, key) in row.counts" :key="key" size="small" effect="plain">
                {{ key }} {{ count }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="170">
          <template #default="{ row }">
            {{ date(row.validStartAt) }} - {{ date(row.validEndAt) }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ date(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无卡券批次" />
    </section>
  </section>
</template>

<style scoped>
.gap-page {
  min-width: 0;
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
.tag-list {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
</style>

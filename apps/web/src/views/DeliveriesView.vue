<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { listDeliveries, type DeliveryItem } from '../services/api/gap-center.api';

const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<DeliveryItem[]>([]);
const search = ref('');
const status = ref('');

function statusLabel(value: string) {
  return (
    {
      pending: '待发货',
      shipped: '已发货',
      delivered: '已签收',
      exception: '异常',
      cancelled: '已取消'
    } as Record<string, string>
  )[value] || value;
}

function statusType(value: string) {
  return value === 'exception'
    ? 'danger'
    : value === 'delivered'
      ? 'success'
      : value === 'shipped'
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
    const result = await listDeliveries({
      search: search.value.trim() || undefined,
      status: status.value || undefined,
      page: 1,
      pageSize: 100
    });
    items.value = result.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '物流列表加载失败';
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
      <span class="readonly-note">订单履约数据仅供查看</span>
    </div>
    <ErrorAlert :message="error" />
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">FULFILLMENT QUEUE</p>
          <h2>物流单列表</h2>
        </div>
        <span class="section-meta">{{ items.length }} 条</span>
      </div>
      <div class="gap-toolbar">
        <el-input
          v-model="search"
          clearable
          placeholder="搜索物流单、订单或运单号"
          @keyup.enter="reload"
        />
        <el-select v-model="status" clearable placeholder="状态" @change="reload">
          <el-option label="待发货" value="pending" />
          <el-option label="已发货" value="shipped" />
          <el-option label="已签收" value="delivered" />
          <el-option label="异常" value="exception" />
        </el-select>
        <el-button type="primary" @click="reload">查询</el-button>
      </div>
      <el-table :data="items" row-key="deliveryId">
        <el-table-column label="物流单" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.deliveryNo }}</strong>
            <small class="muted">{{ row.orderCode || row.orderId }}</small>
          </template>
        </el-table-column>
        <el-table-column label="商家" width="150">
          <template #default="{ row }">{{ row.merchantName || '未关联' }}</template>
        </el-table-column>
        <el-table-column label="收货信息" min-width="210">
          <template #default="{ row }">
            {{ row.receiverName || '未填写' }} {{ row.receiverMobile || '' }}
            <small class="muted">{{ row.address || '地址未填写' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="承运商 / 运单" min-width="170">
          <template #default="{ row }">
            {{ row.logisticsCompany || '未填写' }}
            <small class="muted">{{ row.trackingNo || '未填写' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="statusType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">{{ date(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无物流单" />
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
  width: 300px;
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

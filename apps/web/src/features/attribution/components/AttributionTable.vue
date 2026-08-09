<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import { displayMoney } from '../../../utils/money';
import { formatTime } from '../../../utils/labels';
import {
  ATTRIBUTION_PAGE_SIZE_OPTIONS,
  attributionStatusLabel,
  attributionStatusTagType
} from '../composables/attribution-core';
import type { UnmatchedOrder } from '../../../services/api/attribution.api';

defineProps<{
  items: UnmatchedOrder[];
  pagination: { page: number; pageSize: number; total: number };
  loading: boolean;
  actionLoading: boolean;
  canManage: boolean;
}>();

defineEmits<{
  bind: [order: UnmatchedOrder];
  'page-change': [page: number];
  'size-change': [pageSize: number];
}>();
</script>

<template>
  <section class="attribution-panel">
    <div class="panel-heading">
      <div>
        <h3>未匹配订单</h3>
        <p>订单已脱敏展示；金额使用后端 fen 字段渲染，避免前端浮点误差。</p>
      </div>
      <span class="panel-count">共 {{ pagination.total }} 条</span>
    </div>
    <el-table v-loading="loading" :data="items" row-key="orderId" stripe>
      <el-table-column prop="orderId" label="订单 ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="packageId" label="套餐 ID" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.packageId || '—' }}</template>
      </el-table-column>
      <el-table-column prop="memberId" label="会员标识" width="130">
        <template #default="{ row }">{{ row.memberId || '—' }}</template>
      </el-table-column>
      <el-table-column label="实付金额" width="130" align="right">
        <template #default="{ row }">{{ displayMoney(row, 'paidAmount') }}</template>
      </el-table-column>
      <el-table-column label="下单时间" width="180">
        <template #default="{ row }">{{ formatTime(row.orderTime) }}</template>
      </el-table-column>
      <el-table-column label="订单状态" width="110">
        <template #default="{ row }">
          <el-tag :type="attributionStatusTagType(row.status)" effect="light">
            {{ attributionStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <AppleButton
            size="sm"
            variant="primary"
            :loading="actionLoading"
            @click="$emit('bind', row)"
          >
            手工绑定
          </AppleButton>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前时间窗口内没有未匹配订单" />
      </template>
    </el-table>
    <div class="pagination-row">
      <el-pagination
        :current-page="pagination.page"
        :page-size="pagination.pageSize"
        :page-sizes="ATTRIBUTION_PAGE_SIZE_OPTIONS"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="$emit('page-change', $event)"
        @size-change="$emit('size-change', $event)"
      />
    </div>
  </section>
</template>

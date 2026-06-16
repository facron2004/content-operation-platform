<template>
  <section class="panel">
    <div class="panel-head">
      <h2>待处理预警</h2>
      <div class="panel-actions">
        <span class="muted-cell"> 共 {{ pagination.total }} 条，当前页 {{ alerts.length }} 条 </span>
        <el-button
          type="success"
          :disabled="!alerts.length"
          :loading="resolving"
          @click="$emit('resolve-page')"
        >
          处理当前页
        </el-button>
      </div>
    </div>
    <el-table :data="alerts" height="620" empty-text="暂无待处理预警">
      <el-table-column label="级" width="52" sortable>
        <template #default="{ row }">
          <el-tag
            :type="row.level === 'danger' ? 'danger' : 'warning'"
            effect="plain"
            size="small"
          >
            {{ row.priorityScore ?? 0 }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="60">
        <template #default="{ row }">
          <el-tag :type="riskTagType(row.level)" effect="dark" size="small">
            {{ levelText(row.level) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ alertTypeLabels[row.type] ?? row.type }}</template>
      </el-table-column>
      <el-table-column prop="packageName" label="套餐" min-width="160" show-overflow-tooltip />
      <el-table-column prop="merchantName" label="商家" min-width="110" show-overflow-tooltip />
      <el-table-column prop="areaName" label="区域" width="68" />
      <el-table-column prop="reason" label="触发原因" min-width="150" show-overflow-tooltip />
      <el-table-column prop="action" label="下一步动作" min-width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="$emit('open-detail', row)">
            处理卡
          </el-button>
          <el-button size="small" @click="$emit('resolve', row.alertId)">标记处理</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="alert-pagination">
      <el-pagination
        :current-page="pagination.page"
        :page-size="pagination.pageSize"
        :page-sizes="[50, 80, 120]"
        layout="total, sizes, prev, pager, next"
        :total="pagination.total"
        @current-change="$emit('page-change', $event)"
        @size-change="$emit('size-change', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { OperationAlert } from '@content/shared';
import { alertTypeLabels, riskTagType, levelText } from '../../../utils/labels';

defineProps<{
  alerts: (OperationAlert & { priorityScore?: number })[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  resolving: boolean;
}>();

defineEmits<{
  'open-detail': [alert: OperationAlert & { priorityScore?: number }];
  resolve: [alertId: string];
  'resolve-page': [];
  'page-change': [page: number];
  'size-change': [pageSize: number];
}>();
</script>

<style scoped>
.panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.alert-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
}
</style>

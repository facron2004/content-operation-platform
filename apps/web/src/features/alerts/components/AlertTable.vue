<template>
  <section class="panel alert-table-panel">
    <SectionHeader title="待处理预警" description="先处理高优先级项，再批量收口当前页。">
      <template #actions>
        <span class="muted-cell">共 {{ pagination.total }} 条，当前页 {{ alerts.length }} 条</span>
        <el-button
          type="success"
          :disabled="!alerts.length"
          :loading="resolving"
          @click="$emit('resolve-page')"
        >
          一键处理当前页
        </el-button>
      </template>
    </SectionHeader>

    <div class="page-summary">
      <span>高危 {{ currentPageDangerCount }}</span>
      <span>警告 {{ currentPageWarningCount }}</span>
      <span>平均优先级 {{ currentPageAvgScore }}</span>
      <span>涉及套餐 {{ currentPagePackageCount }}</span>
    </div>

    <el-table
      :data="alerts"
      height="620"
      empty-text="暂无待处理预警"
      class="alert-table"
      :row-class-name="alertRowClassName"
    >
      <el-table-column label="级" width="72" sortable>
        <template #default="{ row }">
          <el-tag :type="row.level === 'danger' ? 'danger' : 'warning'" effect="plain" size="small">
            {{ row.priorityScore ?? 0 }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="68">
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
import { computed } from 'vue';
import type { OperationAlert } from '@content/shared';
import { alertTypeLabels, riskTagType, levelText } from '../../../utils/labels';
import SectionHeader from '../../../components/SectionHeader.vue';

const props = defineProps<{
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

const currentPageDangerCount = computed(
  () => props.alerts.filter((item) => item.level === 'danger').length
);
const currentPageWarningCount = computed(
  () => props.alerts.filter((item) => item.level === 'warning').length
);
const currentPageAvgScore = computed(() => {
  if (!props.alerts.length) return 0;
  const total = props.alerts.reduce((sum, item) => sum + (item.priorityScore ?? 0), 0);
  return Math.round((total / props.alerts.length) * 10) / 10;
});
const currentPagePackageCount = computed(
  () => new Set(props.alerts.map((item) => item.packageId)).size
);

const alertRowClassName = ({ row }: { row: OperationAlert & { priorityScore?: number } }) =>
  row.level === 'danger' ? 'row-danger' : row.level === 'warning' ? 'row-warning' : '';
</script>

<style scoped>
.alert-table-panel {
  overflow: hidden;
}

.page-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0 10px;
}

.page-summary span {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--soft);
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 700;
}

.alert-table {
  margin-top: 4px;
}

.alert-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
}

:deep(.row-danger) td {
  background: rgba(255, 241, 242, 0.68) !important;
}

:deep(.row-warning) td {
  background: rgba(255, 251, 235, 0.58) !important;
}

@media (max-width: 960px) {
  .alert-pagination {
    justify-content: flex-start;
  }
}
</style>

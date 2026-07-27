<template>
  <section class="panel">
    <div class="panel-head">
      <h2>审核队列（{{ windowLabel }}）</h2>
      <div class="panel-filters">
        <el-segmented :model-value="status" :options="statusOptions" @change="onStatusChange" />
        <!-- Residual #215: channel filter (API ListCopiesQueryDto.channel existed unwired). -->
        <el-select
          :model-value="channel"
          size="small"
          style="width: 140px"
          @change="onChannelChange"
        >
          <el-option
            v-for="opt in channelOptions"
            :key="opt.value || 'all'"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
    </div>
    <!-- Residual #270: listCopies INTERACTIVE_LIST_MAX_DAYS window honesty. -->
    <p v-if="dateFrom && dateTo" class="list-window-hint">
      仅展示 {{ windowLabel }} 内生成的文案；更早记录不在本队列分页范围内。
    </p>
    <TableSkeleton v-if="loading && copies.length === 0" :rows="10" :columns="5" />
    <AuditQueueTable
      v-else
      :copies="copies"
      :channel-labels="channelLabels"
      @select="emit('select', $event)"
    />
    <!-- Residual #218: page through listCopies (API page/pageSize + total already applied). -->
    <div v-if="total > 0" class="pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        small
        @update:current-page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
        @current-change="emit('page-change', $event)"
        @size-change="emit('page-size-change', $event)"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import type { GeneratedCopy } from '@content/shared';
import TableSkeleton from '../../../components/TableSkeleton.vue';
import AuditQueueTable from './AuditQueueTable.vue';
withDefaults(
  defineProps<{
    loading: boolean;
    status: string;
    channel: string;
    copies: GeneratedCopy[];
    statusOptions: unknown[];
    channelOptions: Array<{ label: string; value: string }>;
    channelLabels: Record<string, string>;
    // Residual #218
    page: number;
    pageSize: number;
    total: number;
    // Residual #270: INTERACTIVE_LIST_MAX_DAYS window honesty.
    windowLabel?: string;
    dateFrom?: string;
    dateTo?: string;
  }>(),
  {
    windowLabel: '近 90 天',
    dateFrom: undefined,
    dateTo: undefined
  }
);
const emit = defineEmits<{
  'update:status': [value: string];
  'update:channel': [value: string];
  'update:page': [value: number];
  'update:pageSize': [value: number];
  load: [];
  'page-change': [value: number];
  'page-size-change': [value: number];
  select: [row: GeneratedCopy];
}>();
function onStatusChange(value: string | number | boolean) {
  emit('update:status', String(value));
  emit('load');
}
function onChannelChange(value: string) {
  emit('update:channel', value ?? '');
  emit('load');
}
</script>
<style scoped>
.panel-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 10px 4px 0;
}
/* Residual #270 */
.list-window-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>

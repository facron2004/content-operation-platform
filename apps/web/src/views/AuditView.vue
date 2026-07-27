<template>
  <section class="audit-layout">
    <AuditQueuePanel
      :status="status"
      :channel="channel"
      :loading="loading"
      :copies="copies"
      :status-options="statusOptions"
      :channel-options="channelOptions"
      :channel-labels="channelLabels"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :window-label="windowLabel"
      :date-from="dateFrom"
      :date-to="dateTo"
      @update:status="onStatusChange"
      @update:channel="onChannelChange"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
      @select="selectCopy"
    />
    <AuditReviewPanel :selected="selected" :draft="draft" @audit="audit" />
  </section>
</template>
<script setup lang="ts">
import { channelLabels } from '../utils/labels';
import { useAudit } from '../features/audit/use-audit';
import AuditQueuePanel from '../features/audit/components/AuditQueuePanel.vue';
import AuditReviewPanel from '../features/audit/components/AuditReviewPanel.vue';
const {
  loading,
  status,
  channel,
  copies,
  selected,
  draft,
  page,
  pageSize,
  total,
  // Residual #270: listCopies INTERACTIVE window honesty.
  dateFrom,
  dateTo,
  windowLabel,
  statusOptions,
  channelOptions,
  selectCopy,
  audit,
  onStatusChange,
  onChannelChange,
  onPageChange,
  onPageSizeChange
} = useAudit();
</script>

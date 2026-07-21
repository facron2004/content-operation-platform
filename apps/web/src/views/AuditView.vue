<template>
  <section class="audit-layout">
    <AuditQueuePanel
      v-model:status="status"
      :loading="loading"
      :copies="copies"
      :status-options="statusOptions"
      :channel-labels="channelLabels"
      @load="load"
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
const { loading, status, copies, selected, draft, statusOptions, load, selectCopy, audit } =
  useAudit();
</script>

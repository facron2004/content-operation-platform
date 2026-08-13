<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import AttributionTable from '../features/attribution/components/AttributionTable.vue';
import AttributionBindDialog from '../features/attribution/components/AttributionBindDialog.vue';
import { useAttributionPage } from '../features/attribution/composables/useAttributionPage';

const {
  loading,
  actionLoading,
  loadError,
  actionError,
  orders,
  pagination,
  canManage,
  bindDialogVisible,
  bindOrder,
  bindTaskId,
  load,
  handlePageChange,
  handleSizeChange,
  openBind,
  setBindDialogVisible,
  setBindTaskId,
  manualBind,
  recompute
} = useAttributionPage();
</script>

<template>
  <section v-loading="loading" class="page-stack attribution-page">
    <div class="page-toolbar">
      <AppleButton
        variant="secondary"
        size="sm"
        :loading="loading"
        :disabled="actionLoading"
        @click="load"
      >
        刷新列表
      </AppleButton>
      <AppleButton
        v-if="canManage"
        variant="primary"
        size="sm"
        :loading="actionLoading"
        :disabled="loading"
        @click="recompute"
      >
        重算归因
      </AppleButton>
    </div>
    <ErrorAlert :message="loadError" />
    <ErrorAlert :message="actionError" />
    <AttributionTable
      :items="orders"
      :pagination="pagination"
      :loading="loading"
      :action-loading="actionLoading"
      :can-manage="canManage"
      @bind="openBind"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    />
    <AttributionBindDialog
      :model-value="bindDialogVisible"
      :order="bindOrder"
      :task-id="bindTaskId"
      :submitting="actionLoading"
      @update:model-value="setBindDialogVisible"
      @update:task-id="setBindTaskId"
      @submit="manualBind"
    />
  </section>
</template>

<style src="../styles/views/attribution.css" scoped></style>

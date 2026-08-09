<template>
  <section class="settings-view">
    <DesktopRuntimeConfigPanel />
    <SettingsPanelBody
      v-model:defaults-visible="defaultsVisible"
      v-model:page="page"
      v-model:page-size="pageSize"
      :defaults="defaults"
      :filters="filters"
      :type-options="typeOptions"
      :is-active-options="isActiveOptions"
      :rule-type-labels="ruleTypeLabels"
      :pretty="pretty"
      :loading="loading"
      :load-error="loadError"
      :defaults-error="defaultsError"
      :write-error="writeError"
      :rules="rules"
      :format-time="formatTime"
      :total="total"
      :load="load"
      @create="openCreate"
      @activate="activate"
      @remove="remove"
    />
    <SettingsCreateDialog
      v-model="dialogVisible"
      v-model:form="dialogForm"
      :submitting="submitting"
      :type-options="typeOptions"
      :rule-type-labels="ruleTypeLabels"
      @type-change="onTypeChange"
      @load-default="loadDefaultPayload"
      @submit="submitCreate"
    />
  </section>
</template>
<script setup lang="ts">
import { useSettings } from '../features/settings/composables/useSettings';
import SettingsPanelBody from '../features/settings/components/SettingsPanelBody.vue';
import SettingsCreateDialog from '../features/settings/components/SettingsCreateDialog.vue';
import DesktopRuntimeConfigPanel from '../components/DesktopRuntimeConfigPanel.vue';
const {
  loading,
  rules,
  total,
  page,
  pageSize,
  filters,
  defaults,
  defaultsError,
  writeError,
  defaultsVisible,
  loadError,
  dialogVisible,
  submitting,
  dialogForm,
  typeOptions,
  isActiveOptions,
  ruleTypeLabels,
  pretty,
  formatTime,
  load,
  openCreate,
  onTypeChange,
  loadDefaultPayload,
  submitCreate,
  activate,
  remove
} = useSettings();
</script>
<style src="../styles/views/settings.css" scoped></style>

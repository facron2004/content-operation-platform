<script setup lang="ts">
import type { RuleConfig } from '@content/shared';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import SettingsPanelHeader from './SettingsPanelHeader.vue';
import SettingsDefaultsBox from './SettingsDefaultsBox.vue';
import SettingsFilterBar from './SettingsFilterBar.vue';
import SettingsRulesTable from './SettingsRulesTable.vue';
import SettingsPager from './SettingsPager.vue';

export type SettingsPanelBodyProps = {
  defaults: Record<string, unknown> | null;
  filters: { merchantId: string; type: string; isActive: string };
  typeOptions: Array<{ label: string; value: string }>;
  isActiveOptions: Array<{ label: string; value: string }>;
  ruleTypeLabels: Record<string, string>;
  pretty: (value: unknown) => string;
  loading: boolean;
  loadError: string | null;
  defaultsError: string | null;
  writeError: string | null;
  rules: RuleConfig[];
  formatTime: (value?: string) => string;
  total: number;
  load: () => void | Promise<void>;
};
defineProps<SettingsPanelBodyProps>();
const defaultsVisible = defineModel<boolean>('defaultsVisible', { required: true });
const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
defineEmits<{ create: []; activate: [row: RuleConfig]; remove: [row: RuleConfig] }>();
</script>
<template>
  <el-card class="panel" shadow="never">
    <ErrorAlert :message="loadError" />
    <ErrorAlert :message="defaultsError" />
    <ErrorAlert :message="writeError" />
    <SettingsPanelHeader
      :defaults-visible="defaultsVisible"
      @toggle-defaults="defaultsVisible = !defaultsVisible"
      @create="$emit('create')"
    />
    <el-collapse-transition>
      <SettingsDefaultsBox
        v-if="defaultsVisible && defaults"
        :defaults="defaults"
        :rule-type-labels="ruleTypeLabels"
        :pretty="pretty"
      />
    </el-collapse-transition>
    <SettingsFilterBar
      :filters="filters"
      :type-options="typeOptions"
      :is-active-options="isActiveOptions"
      @load="load"
    />
    <SettingsRulesTable
      :loading="loading"
      :rules="rules"
      :rule-type-labels="ruleTypeLabels"
      :pretty="pretty"
      :format-time="formatTime"
      @activate="$emit('activate', $event)"
      @remove="$emit('remove', $event)"
    />
    <SettingsPager v-model:page="page" v-model:page-size="pageSize" :total="total" :load="load" />
  </el-card>
</template>

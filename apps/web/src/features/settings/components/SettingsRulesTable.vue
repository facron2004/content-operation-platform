<script setup lang="ts">
import type { RuleConfig } from '@content/shared';
import { api } from '../../../services/api';
import AppleButton from '../../../components/AppleButton.vue';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import SettingsRulesTableColumns from './SettingsRulesTableColumns.vue';
import { useRulePayload } from '../composables/useRulePayload';

const props = defineProps<{
  loading: boolean;
  rules: RuleConfig[];
  ruleTypeLabels: Record<string, string>;
  pretty: (value: unknown) => string;
  formatTime: (value?: string) => string;
}>();
defineEmits<{ activate: [row: RuleConfig]; remove: [row: RuleConfig] }>();

async function ensurePayload(row: RuleConfig): Promise<void> {
  await loadPayload(row);
}

const {
  payloadById,
  payloadErrorById,
  loadingById,
  ensurePayload: loadPayload
} = useRulePayload(
  () => props.rules,
  (id) => api.getRule(id)
);

function onExpandChange(row: RuleConfig, expandedRows: RuleConfig[]) {
  const isExpanded = expandedRows.some((r) => r.id === row.id);
  if (!isExpanded) return;
  void ensurePayload(row);
}
</script>
<template>
  <el-table
    v-loading="loading"
    :data="rules"
    empty-text="暂无规则配置"
    @expand-change="onExpandChange"
  >
    <el-table-column type="expand">
      <template #default="{ row }">
        <div v-if="loadingById[row.id]" class="payload-preview">加载中…</div>
        <div v-else-if="payloadErrorById[row.id]" class="payload-error">
          <ErrorAlert :message="payloadErrorById[row.id]" />
          <AppleButton size="sm" variant="secondary" @click="ensurePayload(row)">
            重新加载详情
          </AppleButton>
        </div>
        <pre v-else class="payload-preview">{{
          pretty(payloadById[row.id] ?? row.payload ?? {})
        }}</pre>
      </template>
    </el-table-column>
    <SettingsRulesTableColumns
      :rule-type-labels="ruleTypeLabels"
      :format-time="formatTime"
      @activate="$emit('activate', $event)"
      @remove="$emit('remove', $event)"
    />
  </el-table>
</template>

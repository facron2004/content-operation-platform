<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { RuleConfig, RuleConfigPayload } from '@content/shared';
import { api } from '../../../services/api';
import SettingsRulesTableColumns from './SettingsRulesTableColumns.vue';

const props = defineProps<{
  loading: boolean;
  rules: RuleConfig[];
  ruleTypeLabels: Record<string, string>;
  pretty: (value: unknown) => string;
  formatTime: (value?: string) => string;
}>();
defineEmits<{ activate: [row: RuleConfig]; remove: [row: RuleConfig] }>();

// Residual #223: list omits payload (RULE_CONFIG_LIST_SELECT); expand fetches getRule.
const payloadById = reactive<Record<string, RuleConfigPayload>>({});
const loadingById = reactive<Record<string, boolean>>({});
const inflight = new Map<string, Promise<RuleConfigPayload>>();

// Drop cached payloads when the list page reloads so stale expand data cannot linger.
watch(
  () => props.rules.map((r) => r.id).join('|'),
  () => {
    for (const key of Object.keys(payloadById)) delete payloadById[key];
    for (const key of Object.keys(loadingById)) delete loadingById[key];
    inflight.clear();
  }
);

async function ensurePayload(row: RuleConfig): Promise<void> {
  if (payloadById[row.id] !== undefined) return;
  const listPayload = row.payload;
  if (listPayload && typeof listPayload === 'object' && Object.keys(listPayload).length > 0) {
    payloadById[row.id] = listPayload;
    return;
  }
  let pending = inflight.get(row.id);
  if (!pending) {
    loadingById[row.id] = true;
    pending = api
      .getRule(row.id)
      .then((detail) => {
        const payload = (detail.payload ?? {}) as RuleConfigPayload;
        payloadById[row.id] = payload;
        return payload;
      })
      .catch(() => {
        // Fall back to empty object; interceptor already surfaces the error.
        const fallback = (row.payload ?? {}) as RuleConfigPayload;
        payloadById[row.id] = fallback;
        return fallback;
      })
      .finally(() => {
        loadingById[row.id] = false;
        inflight.delete(row.id);
      });
    inflight.set(row.id, pending);
  }
  await pending;
}

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

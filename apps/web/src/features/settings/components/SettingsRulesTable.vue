<script setup lang="ts">
import type { RuleConfig } from '@content/shared';
import SettingsRulesTableColumns from './SettingsRulesTableColumns.vue';
defineProps<{
  loading: boolean;
  rules: RuleConfig[];
  ruleTypeLabels: Record<string, string>;
  pretty: (value: unknown) => string;
  formatTime: (value?: string) => string;
}>();
defineEmits<{ activate: [row: RuleConfig]; remove: [row: RuleConfig] }>();
</script>
<template>
  <el-table v-loading="loading" :data="rules" empty-text="暂无规则配置">
    <el-table-column type="expand">
      <template #default="{ row }">
        <pre class="payload-preview">{{ pretty(row.payload) }}</pre>
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

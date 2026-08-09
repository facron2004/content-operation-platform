<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import type { AICopyStatus } from '../services/api';
import SectionHeader from './SectionHeader.vue';
import AiConfigStatusCard from './AiConfigStatusCard.vue';
import AiConfigFormFields from './AiConfigFormFields.vue';
import AiGenerateForm from './AiGenerateForm.vue';
import AiConfigMissingAlert from './AiConfigMissingAlert.vue';
import type { GenerateForm, AIConfigForm } from './ai-config-types';
export type { GenerateForm, AIConfigForm } from './ai-config-types';
defineProps<{
  aiStatus: AICopyStatus | null;
  configSaving: boolean;
  loading: boolean;
  generationMode: 'ai' | 'rule' | null;
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
  // Residual #268: generate package picker multi-page honesty.
  truncated?: boolean;
  limit?: number | null;
  matchedCount?: number | null;
}>();
const form = defineModel<GenerateForm>('form', { required: true }),
  configForm = defineModel<AIConfigForm>('configForm', { required: true });
defineEmits<{ 'refresh-status': []; 'save-config': []; generate: [useAI: boolean] }>();
</script>
<template>
  <section class="panel ai-control-panel">
    <SectionHeader
      title="AI文案接口"
      description="配置生成器、检查连通状态，并决定使用 AI 还是规则兜底。"
    >
      <template #actions>
        <el-tag :type="aiStatus?.enabled ? 'success' : 'danger'">
          {{ aiStatus?.enabled ? '已接入' : '未配置' }}
        </el-tag>
      </template>
    </SectionHeader>
    <AiConfigStatusCard :ai-status="aiStatus" @refresh="$emit('refresh-status')" />
    <AiConfigMissingAlert :ai-status="aiStatus" />
    <AiConfigFormFields
      v-model:config-form="configForm"
      :ai-status="aiStatus"
      :config-saving="configSaving"
      @save="$emit('save-config')"
    />
    <AiGenerateForm
      v-model:form="form"
      :packages="packages"
      :channel-options="channelOptions"
      :loading="loading"
      :generation-mode="generationMode"
      :truncated="truncated"
      :limit="limit"
      :matched-count="matchedCount"
      @generate="(useAI) => $emit('generate', useAI)"
    />
  </section>
</template>
<style src="../styles/components/ai-config-panel.css" scoped></style>

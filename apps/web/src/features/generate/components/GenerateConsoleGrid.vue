<template>
  <div class="ai-console-grid">
    <AiConfigPanel
      v-model:form="form"
      v-model:config-form="configForm"
      :ai-status="aiStatus"
      :config-saving="configSaving"
      :loading="loading"
      :generation-mode="generationMode"
      :packages="packages"
      :channel-options="channelOptions"
      :truncated="truncated"
      :limit="limit"
      :matched-count="matchedCount"
      @refresh-status="$emit('refresh-status')"
      @save-config="$emit('save-config')"
      @generate="$emit('generate', $event)"
    />
    <PackageFeedPanel
      :selected-package="selectedPackage"
      :package-detail="packageDetail"
      :detail-loading="detailLoading"
      :package-id="form.packageId"
      :feed-facts="feedFacts"
      :feed-checks="feedChecks"
      :format-detail-items="formatDetailItems"
      @refresh="$emit('refresh-detail')"
    />
  </div>
</template>
<script setup lang="ts">
import AiConfigPanel from '../../../components/AiConfigPanel.vue';
import PackageFeedPanel from '../../../components/PackageFeedPanel.vue';
import type {
  AIConfigForm,
  GenerateConsoleGridProps,
  GenerateForm
} from './generate-console-grid-types';
defineProps<GenerateConsoleGridProps>();
const form = defineModel<GenerateForm>('form', { required: true }),
  configForm = defineModel<AIConfigForm>('configForm', { required: true });
defineEmits<{
  'refresh-status': [];
  'save-config': [];
  generate: [useAI: boolean];
  'refresh-detail': [];
}>();
</script>

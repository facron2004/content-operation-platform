<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue';
import type { RecommendPackageItem } from '@content/shared';
import type { GenerateForm } from './AiConfigPanel.vue';
import AiGenerateFormFields from './AiGenerateFormFields.vue';
import AppleButton from './AppleButton.vue';
defineProps<{
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
  loading: boolean;
  generationMode: 'ai' | 'rule' | null;
  // Residual #268: generate package picker honesty.
  truncated?: boolean;
  limit?: number | null;
  matchedCount?: number | null;
}>();
const form = defineModel<GenerateForm>('form', { required: true });
defineEmits<{ generate: [useAI: boolean] }>();
</script>
<template>
  <el-form label-position="top" class="ai-form">
    <AiGenerateFormFields
      v-model:form="form"
      :packages="packages"
      :channel-options="channelOptions"
      :truncated="truncated"
      :limit="limit"
      :matched-count="matchedCount"
    />
    <div class="generate-actions">
      <AppleButton
        class="generate-button"
        variant="primary"
        :loading="loading && generationMode === 'ai'"
        @click="$emit('generate', true)"
      >
        <template #icon>
          <el-icon><MagicStick /></el-icon>
        </template>
        AI生成文案
      </AppleButton>
      <AppleButton
        class="generate-button"
        variant="secondary"
        :loading="loading && generationMode === 'rule'"
        @click="$emit('generate', false)"
      >
        规则兜底生成
      </AppleButton>
    </div>
  </el-form>
</template>

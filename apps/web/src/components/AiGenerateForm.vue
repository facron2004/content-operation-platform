<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue';
import type { RecommendPackageItem } from '@content/shared';
import type { GenerateForm } from './AiConfigPanel.vue';
import AiGenerateFormFields from './AiGenerateFormFields.vue';
defineProps<{
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
  loading: boolean;
  generationMode: 'ai' | 'rule' | null;
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
    />
    <div class="generate-actions">
      <el-button
        class="generate-button"
        type="primary"
        :icon="MagicStick"
        :loading="loading && generationMode === 'ai'"
        @click="$emit('generate', true)"
      >
        AI生成文案
      </el-button>
      <el-button
        class="generate-button"
        :loading="loading && generationMode === 'rule'"
        @click="$emit('generate', false)"
      >
        规则兜底生成
      </el-button>
    </div>
  </el-form>
</template>

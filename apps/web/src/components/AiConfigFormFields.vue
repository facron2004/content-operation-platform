<script setup lang="ts">
import type { AICopyStatus } from '../services/api';
import type { AIConfigForm } from './AiConfigPanel.vue';
import AiConfigFormBody from './AiConfigFormBody.vue';
defineProps<{ aiStatus: AICopyStatus | null; configSaving: boolean }>();
const configForm = defineModel<AIConfigForm>('configForm', { required: true });
defineEmits<{ save: [] }>();
</script>
<template>
  <div class="config-box">
    <div class="config-head">
      <strong>接口配置</strong>
      <el-tag type="warning" effect="plain" size="small">仅本次运行生效，重启后需重新配置</el-tag>
    </div>
    <AiConfigFormBody
      v-model:config-form="configForm"
      :ai-status="aiStatus"
      :config-saving="configSaving"
      @save="$emit('save')"
    />
  </div>
</template>

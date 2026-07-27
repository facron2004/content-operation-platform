<script setup lang="ts">
import type { AICopyStatus } from '../services/api';
import type { AIConfigForm } from './AiConfigPanel.vue';
import AppleButton from './AppleButton.vue';
defineProps<{ aiStatus: AICopyStatus | null; configSaving: boolean }>();
const configForm = defineModel<AIConfigForm>('configForm', { required: true });
defineEmits<{ save: [] }>();
</script>
<template>
  <el-form label-position="top" class="config-form">
    <el-form-item label="API Base URL">
      <el-input v-model="configForm.baseURL" placeholder="https://api.deepseek.com" />
    </el-form-item>
    <el-form-item label="模型">
      <el-input v-model="configForm.model" placeholder="deepseek-chat" />
    </el-form-item>
    <el-form-item label="服务名">
      <el-input v-model="configForm.providerName" placeholder="DeepSeek" />
    </el-form-item>
    <el-form-item label="API Key">
      <el-input
        v-model="configForm.apiKey"
        type="password"
        show-password
        autocomplete="new-password"
        :placeholder="aiStatus?.maskedApiKey ? `当前：${aiStatus.maskedApiKey}` : '请输入 API Key'"
      />
    </el-form-item>
    <div class="config-number-row">
      <el-form-item label="Temperature">
        <el-input-number v-model="configForm.temperature" :min="0" :max="2" :step="0.1" />
      </el-form-item>
      <el-form-item label="Max Tokens">
        <el-input-number v-model="configForm.maxTokens" :min="200" :max="4000" :step="100" />
      </el-form-item>
    </div>
    <AppleButton
      class="config-save-button"
      variant="secondary"
      :loading="configSaving"
      @click="$emit('save')"
    >
      保存接口配置
    </AppleButton>
  </el-form>
</template>

import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { AICopyStatus } from '../services/api';
import { api } from '../services/api';

export function useAICopyConfig() {
  const configSaving = ref(false);
  const aiStatus = ref<AICopyStatus | null>(null);

  const configForm = reactive({
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    providerName: 'DeepSeek',
    temperature: 0.7,
    maxTokens: 900
  });

  const syncConfigForm = (status: AICopyStatus) => {
    if (!configForm.apiKey.trim()) {
      configForm.apiKey = '';
    }
    configForm.baseURL = status.baseURL;
    configForm.model = status.model;
    configForm.providerName = status.providerName;
    configForm.temperature = status.temperature;
    configForm.maxTokens = status.maxTokens;
  };

  const loadAICopyStatus = async () => {
    aiStatus.value = await api.getAICopyStatus();
    syncConfigForm(aiStatus.value);
  };

  const saveAICopyConfig = async () => {
    if (!configForm.baseURL.trim() || !configForm.model.trim()) {
      ElMessage.warning('请填写接口地址和模型');
      return;
    }
    if (!configForm.apiKey.trim() && !aiStatus.value?.maskedApiKey) {
      ElMessage.warning('请填写 API Key');
      return;
    }

    configSaving.value = true;
    try {
      const payload = {
        baseURL: configForm.baseURL.trim(),
        model: configForm.model.trim(),
        providerName: configForm.providerName.trim() || undefined,
        temperature: configForm.temperature,
        maxTokens: configForm.maxTokens,
        ...(configForm.apiKey.trim() ? { apiKey: configForm.apiKey.trim() } : {})
      };
      aiStatus.value = await api.updateAICopyConfig(payload);
      syncConfigForm(aiStatus.value);
      ElMessage.success('AI接口配置已保存');
    } catch {
      // 错误已由拦截器处理
    } finally {
      configSaving.value = false;
    }
  };

  return {
    configSaving,
    aiStatus,
    configForm,
    loadAICopyStatus,
    saveAICopyConfig
  };
}

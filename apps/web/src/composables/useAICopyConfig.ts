import { ElMessage } from 'element-plus';
import { reactive, ref, type Ref } from 'vue';
import { api, type AICopyStatus } from '../services/api';

export type AICopyConfigForm = {
  apiKey: string;
  baseURL: string;
  model: string;
  providerName: string;
  temperature: number;
  maxTokens: number;
};

export function syncAICopyConfigForm(form: AICopyConfigForm, status: AICopyStatus) {
  if (!form.apiKey.trim()) form.apiKey = '';
  form.baseURL = status.baseURL;
  form.model = status.model;
  form.providerName = status.providerName;
  form.temperature = status.temperature;
  form.maxTokens = status.maxTokens;
}

function buildAICopyConfigPayload(form: AICopyConfigForm) {
  return {
    baseURL: form.baseURL.trim(),
    model: form.model.trim(),
    providerName: form.providerName.trim() || undefined,
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {})
  };
}

async function loadAICopyStatusRequest(
  aiStatus: Ref<AICopyStatus | null>,
  sync: (status: AICopyStatus) => void
) {
  aiStatus.value = await api.getAICopyStatus();
  sync(aiStatus.value);
}

async function saveAICopyConfigRequest(params: {
  configForm: AICopyConfigForm;
  aiStatus: Ref<AICopyStatus | null>;
  configSaving: Ref<boolean>;
  sync: (status: AICopyStatus) => void;
}) {
  if (!params.configForm.baseURL.trim() || !params.configForm.model.trim()) {
    ElMessage.warning('请填写接口地址和模型');
    return;
  }
  if (!params.configForm.apiKey.trim() && !params.aiStatus.value?.maskedApiKey) {
    ElMessage.warning('请填写 API Key');
    return;
  }
  params.configSaving.value = true;
  try {
    params.aiStatus.value = await api.updateAICopyConfig(
      buildAICopyConfigPayload(params.configForm)
    );
    params.sync(params.aiStatus.value);
    ElMessage.success('AI接口配置已保存');
  } catch {
    /* interceptor */
  } finally {
    params.configSaving.value = false;
  }
}

export function useAICopyConfig() {
  const configSaving = ref(false),
    aiStatus = ref<AICopyStatus | null>(null);
  const configForm = reactive({
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    providerName: 'DeepSeek',
    temperature: 0.7,
    maxTokens: 900
  });
  return {
    configSaving,
    aiStatus,
    configForm,
    loadAICopyStatus: () =>
      loadAICopyStatusRequest(aiStatus, (status) => syncAICopyConfigForm(configForm, status)),
    saveAICopyConfig: () =>
      saveAICopyConfigRequest({
        configForm,
        aiStatus,
        configSaving,
        sync: (status) => syncAICopyConfigForm(configForm, status)
      })
  };
}

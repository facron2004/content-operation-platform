import { ElMessage } from 'element-plus';
import { onScopeDispose, reactive, ref, type Ref } from 'vue';
import { api, type AICopyStatus } from '../services/api';
import { extractErrorMessage } from '../services/http-client';

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

function validateAICopyConfig(form: AICopyConfigForm, status: AICopyStatus | null) {
  if (!form.baseURL.trim() || !form.model.trim()) {
    ElMessage.warning('请填写接口地址和模型');
    return false;
  }
  if (!form.apiKey.trim() && !status?.maskedApiKey) {
    ElMessage.warning('请填写 API Key');
    return false;
  }
  return true;
}

async function loadAICopyStatusRequest(
  aiStatus: Ref<AICopyStatus | null>,
  sync: (status: AICopyStatus) => void,
  isCurrent: () => boolean
) {
  if (!isCurrent()) return;
  const status = await api.getAICopyStatus();
  if (!isCurrent()) return;
  aiStatus.value = status;
  sync(status);
}

async function saveAICopyConfigRequest(params: {
  configForm: AICopyConfigForm;
  aiStatus: Ref<AICopyStatus | null>;
  configError: Ref<string | null>;
  configSaving: Ref<boolean>;
  sync: (status: AICopyStatus) => void;
  isCurrent: () => boolean;
}) {
  if (!params.isCurrent() || params.configSaving.value) return;
  const payload = buildAICopyConfigPayload(params.configForm);
  params.configSaving.value = true;
  try {
    const status = await api.updateAICopyConfig(payload);
    if (!params.isCurrent()) return;
    params.aiStatus.value = status;
    params.sync(status);
    ElMessage.success('AI接口配置已保存');
  } catch (error) {
    if (params.isCurrent()) {
      params.configError.value = extractErrorMessage(error, 'AI接口配置保存失败，请稍后重试');
    }
  } finally {
    if (params.isCurrent()) params.configSaving.value = false;
  }
}

export function useAICopyConfig() {
  const configSaving = ref(false),
    aiStatus = ref<AICopyStatus | null>(null),
    aiStatusError = ref<string | null>(null),
    configError = ref<string | null>(null);
  const configForm = reactive({
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    providerName: 'DeepSeek',
    temperature: 0.7,
    maxTokens: 900
  });
  let disposed = false;
  let statusRequestId = 0;
  let saveRequestId = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    statusRequestId += 1;
    saveRequestId += 1;
    configSaving.value = false;
  };
  onScopeDispose(dispose);

  return {
    configSaving,
    aiStatus,
    aiStatusError,
    configError,
    configForm,
    loadAICopyStatus: async () => {
      if (disposed || configSaving.value) return;
      const requestId = ++statusRequestId;
      aiStatusError.value = null;
      try {
        await loadAICopyStatusRequest(
          aiStatus,
          (status) => syncAICopyConfigForm(configForm, status),
          () => !disposed && !configSaving.value && requestId === statusRequestId
        );
      } catch (error) {
        if (!disposed && requestId === statusRequestId) {
          aiStatusError.value = extractErrorMessage(error, 'AI接口状态读取失败，请稍后重试');
        }
      }
    },
    saveAICopyConfig: async () => {
      if (disposed || configSaving.value) return;
      configError.value = null;
      if (!validateAICopyConfig(configForm, aiStatus.value)) return;
      const requestId = ++saveRequestId;
      statusRequestId += 1;
      await saveAICopyConfigRequest({
        configForm,
        aiStatus,
        configError,
        configSaving,
        sync: (status) => syncAICopyConfigForm(configForm, status),
        isCurrent: () => !disposed && requestId === saveRequestId
      });
    }
  };
}

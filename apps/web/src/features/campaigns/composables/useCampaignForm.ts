import { computed, onScopeDispose, reactive, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormRules } from 'element-plus';
import type { MarketingCampaign } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

export interface CampaignFormModel {
  name: string;
  campaignType: MarketingCampaign['campaignType'];
  description: string;
  startDate: string;
  endDate: string;
  areaIds: string[];
  merchantIds: string[];
  budget: number;
  targetGmv: number;
  targetOrders: number;
}

export interface CampaignFormOptions {
  onSuccess?: () => void | Promise<void>;
  writeError?: Ref<string | null>;
}

function createDefaultForm(): CampaignFormModel {
  return {
    name: '',
    campaignType: 'daily',
    description: '',
    startDate: '',
    endDate: '',
    areaIds: [],
    merchantIds: [],
    budget: 0,
    targetGmv: 0,
    targetOrders: 0
  };
}

export function buildCampaignFormRules(form: CampaignFormModel): FormRules<CampaignFormModel> {
  return {
    name: [
      { required: true, message: '请输入活动名称', trigger: 'blur' },
      { min: 2, max: 50, message: '长度需在 2-50 个字符之间', trigger: 'blur' }
    ],
    campaignType: [{ required: true, message: '请选择活动类型', trigger: 'change' }],
    startDate: [
      {
        validator: (_rule, _value, callback) => {
          if (!form.startDate || !form.endDate) {
            callback(new Error('请选择活动起止日期'));
          } else if (form.endDate < form.startDate) {
            callback(new Error('结束日期不能早于开始日期'));
          } else {
            callback();
          }
        },
        trigger: 'change'
      }
    ],
    areaIds: [
      { required: true, type: 'array', min: 1, message: '请至少选择一个区域', trigger: 'change' }
    ],
    budget: [
      { required: true, type: 'number', min: 0, message: '请输入有效预算', trigger: 'blur' }
    ],
    targetGmv: [
      { required: true, type: 'number', min: 0, message: '请输入有效目标 GMV', trigger: 'blur' }
    ],
    targetOrders: [
      { required: true, type: 'number', min: 0, message: '请输入有效目标订单数', trigger: 'blur' }
    ]
  };
}

export function useCampaignForm(existing?: MarketingCampaign, options: CampaignFormOptions = {}) {
  const dialogVisible = ref(false);
  const submitting = ref(false);
  const editingId = ref<string | null>(null);
  const form = reactive<CampaignFormModel>(createDefaultForm());
  const writeError = options.writeError ?? ref<string | null>(null);
  let disposed = false;
  let submitRequestId = 0;

  const isEdit = computed(() => editingId.value !== null);
  const title = computed(() => (isEdit.value ? '编辑活动' : '新建活动'));
  const rules = buildCampaignFormRules(form);

  onScopeDispose(() => {
    disposed = true;
    submitRequestId += 1;
    submitting.value = false;
  }, true);

  function invalidateSubmit(): void {
    submitRequestId += 1;
    submitting.value = false;
  }

  function populateFrom(campaign: MarketingCampaign): void {
    editingId.value = campaign.campaignId;
    form.name = campaign.name;
    form.campaignType = campaign.campaignType;
    form.description = campaign.description ?? '';
    form.startDate = campaign.startDate ? campaign.startDate.slice(0, 10) : '';
    form.endDate = campaign.endDate ? campaign.endDate.slice(0, 10) : '';
    form.areaIds = [...(campaign.areaIds ?? [])];
    form.merchantIds = [...(campaign.merchantIds ?? [])];
    form.budget = campaign.budget;
    form.targetGmv = campaign.targetGmv;
    form.targetOrders = campaign.targetOrders;
  }

  function resetForm(): void {
    editingId.value = null;
    Object.assign(form, createDefaultForm());
  }

  function open(campaign?: MarketingCampaign): void {
    if (disposed) return;
    invalidateSubmit();
    writeError.value = null;
    if (campaign) {
      populateFrom(campaign);
    } else {
      resetForm();
    }
    dialogVisible.value = true;
  }

  function close(): void {
    if (disposed) return;
    invalidateSubmit();
    dialogVisible.value = false;
  }

  function validate(): string | null {
    if (!form.name.trim()) return '请输入活动名称';
    if (!form.campaignType) return '请选择活动类型';
    if (!form.startDate || !form.endDate) return '请选择活动起止日期';
    if (!form.areaIds.length) return '请至少选择一个区域';
    return null;
  }

  async function submit(): Promise<void> {
    if (disposed || submitting.value) return;
    const invalidMessage = validate();
    if (invalidMessage) {
      ElMessage.warning(invalidMessage);
      return;
    }
    const requestId = ++submitRequestId;
    writeError.value = null;
    submitting.value = true;
    try {
      let successMessage: string;
      if (isEdit.value && editingId.value) {
        await api.updateCampaign(editingId.value, {
          name: form.name.trim(),
          // Residual #195: campaignType was editable in dialog but dropped on PATCH.
          campaignType: form.campaignType,
          description: form.description.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          areaIds: [...form.areaIds],
          merchantIds: [...form.merchantIds],
          budget: Number(form.budget) || 0,
          targetGmv: Number(form.targetGmv) || 0,
          targetOrders: Math.round(Number(form.targetOrders) || 0)
        });
        successMessage = '活动已更新';
      } else {
        await api.createCampaign({
          name: form.name.trim(),
          campaignType: form.campaignType,
          description: form.description.trim() || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
          areaIds: [...form.areaIds],
          merchantIds: form.merchantIds.length ? [...form.merchantIds] : undefined,
          budget: Number(form.budget) || 0,
          targetGmv: Number(form.targetGmv) || 0,
          targetOrders: Math.round(Number(form.targetOrders) || 0)
        });
        successMessage = '活动已创建';
      }
      if (disposed || requestId !== submitRequestId) return;
      ElMessage.success(successMessage);
      dialogVisible.value = false;
      await options.onSuccess?.();
    } catch (error) {
      if (disposed || requestId !== submitRequestId) return;
      const message = extractErrorMessage(error, isEdit.value ? '更新活动失败' : '创建活动失败');
      writeError.value = message;
      ElMessage.error(message);
    } finally {
      if (requestId === submitRequestId) submitting.value = false;
    }
  }

  if (existing) populateFrom(existing);

  return {
    form,
    submitting,
    writeError,
    isEdit,
    title,
    rules,
    open,
    close,
    submit,
    get dialogVisible() {
      return dialogVisible.value;
    },
    set dialogVisible(value: boolean) {
      if (value) {
        open();
      } else {
        close();
      }
    }
  };
}

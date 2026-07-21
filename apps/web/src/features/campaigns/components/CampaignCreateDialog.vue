<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑活动' : '新建活动'"
    width="640px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <el-form ref="formRef" :model="localForm" :rules="rules" label-width="100px">
      <el-form-item label="活动名称" prop="name">
        <el-input
          v-model="localForm.name"
          placeholder="请输入活动名称"
          maxlength="50"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="活动类型" prop="campaignType">
        <el-select
          v-model="localForm.campaignType"
          placeholder="请选择活动类型"
          style="width: 100%"
        >
          <el-option
            v-for="opt in typeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="活动描述" prop="description">
        <el-input
          v-model="localForm.description"
          type="textarea"
          :rows="3"
          placeholder="选填"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="活动时间" prop="startDate">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="覆盖区域" prop="areaIds">
        <el-select
          v-model="localForm.areaIds"
          multiple
          filterable
          allow-create
          default-first-option
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择或输入区域 ID"
          style="width: 100%"
        >
          <el-option
            v-for="opt in areaOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="关联商家" prop="merchantIds">
        <el-select
          v-model="localForm.merchantIds"
          multiple
          filterable
          allow-create
          default-first-option
          collapse-tags
          collapse-tags-tooltip
          placeholder="选填，选择或输入商家 ID"
          style="width: 100%"
        >
          <el-option
            v-for="opt in merchantOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="活动预算" prop="budget">
        <el-input-number
          v-model="localForm.budget"
          :min="0"
          :precision="2"
          :step="1000"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="目标 GMV" prop="targetGmv">
        <el-input-number
          v-model="localForm.targetGmv"
          :min="0"
          :precision="2"
          :step="1000"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="目标订单" prop="targetOrders">
        <el-input-number
          v-model="localForm.targetOrders"
          :min="0"
          :precision="0"
          :step="10"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleConfirm">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue';
import type { FormInstance } from 'element-plus';
import { buildCampaignFormRules, type CampaignFormModel } from '../composables/useCampaignForm';
import { CAMPAIGN_TYPE_LABELS } from '../composables/useCampaigns';

interface SelectOption {
  label: string;
  value: string;
}

const dialogVisible = defineModel<boolean>({ default: false });

const props = withDefaults(
  defineProps<{
    submitting?: boolean;
    isEdit?: boolean;
    form: CampaignFormModel;
    areaOptions?: SelectOption[];
    merchantOptions?: SelectOption[];
  }>(),
  {
    submitting: false,
    isEdit: false,
    areaOptions: () => [],
    merchantOptions: () => []
  }
);

const emit = defineEmits<{
  submit: [form: CampaignFormModel];
  'update:form': [form: CampaignFormModel];
}>();

const formRef = ref<FormInstance>();
const localForm = reactive({ ...props.form });
watchEffect(() => Object.assign(localForm, props.form));
const rules = buildCampaignFormRules(localForm);

const typeOptions = Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => ({
  value,
  label
}));

const dateRange = computed({
  get: () =>
    localForm.startDate && localForm.endDate ? [localForm.startDate, localForm.endDate] : null,
  set: (value: [string, string] | null) => {
    localForm.startDate = value?.[0] ?? '';
    localForm.endDate = value?.[1] ?? '';
  }
});

async function handleConfirm(): Promise<void> {
  if (!formRef.value) {
    emit('submit', localForm);
    return;
  }
  try {
    await formRef.value.validate();
    emit('submit', localForm);
  } catch {
    // validation errors are displayed inline by el-form
  }
}

function handleClosed(): void {
  formRef.value?.clearValidate();
}
</script>

<style scoped>
:deep(.el-form-item__label) {
  font-weight: 500;
}
</style>

<template>
  <!-- Parent passes a reactive form object; child writes fields in place. -->
  <!-- Residual #195: was cloning a dialog-local form + emit payload that parents ignored. -->
  <!-- eslint-disable vue/no-mutating-props -->
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑活动' : '新建活动'"
    width="640px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="活动名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入活动名称" maxlength="50" show-word-limit />
      </el-form-item>
      <el-form-item label="活动类型" prop="campaignType">
        <el-select v-model="form.campaignType" placeholder="请选择活动类型" style="width: 100%">
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
          v-model="form.description"
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
          v-model="form.areaIds"
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
          v-model="form.merchantIds"
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
          v-model="form.budget"
          :min="0"
          :precision="2"
          :step="1000"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="目标 GMV" prop="targetGmv">
        <el-input-number
          v-model="form.targetGmv"
          :min="0"
          :precision="2"
          :step="1000"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item label="目标订单" prop="targetOrders">
        <el-input-number
          v-model="form.targetOrders"
          :min="0"
          :precision="0"
          :step="10"
          controls-position="right"
          style="width: 220px"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="handleConfirm">
        {{ isEdit ? '保存' : '创建' }}
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormInstance } from 'element-plus';
import AppleButton from '../../../components/AppleButton.vue';
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
  submit: [];
}>();

const formRef = ref<FormInstance>();
// Residual #195: bind directly to parent reactive form (community dialog pattern).
const form = props.form;
const rules = buildCampaignFormRules(form);

const typeOptions = Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => ({
  value,
  label
}));

const dateRange = computed({
  get: () => (form.startDate && form.endDate ? [form.startDate, form.endDate] : null),
  set: (value: [string, string] | null) => {
    form.startDate = value?.[0] ?? '';
    form.endDate = value?.[1] ?? '';
  }
});

async function handleConfirm(): Promise<void> {
  if (!formRef.value) {
    emit('submit');
    return;
  }
  try {
    await formRef.value.validate();
    emit('submit');
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

<template>
  <!-- Parent passes a reactive form object; child writes fields in place. -->
  <!-- eslint-disable vue/no-mutating-props -->
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑社群' : '新建社群'"
    width="560px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" label-position="right">
      <el-form-item label="社群名称" prop="groupName">
        <el-input
          v-model="form.groupName"
          placeholder="请输入社群名称"
          maxlength="50"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="社群类型" prop="groupType">
        <el-select v-model="form.groupType" placeholder="请选择社群类型" class="full-width">
          <el-option
            v-for="option in groupTypeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="区域ID" prop="areaId">
        <el-input v-model="form.areaId" placeholder="请输入所属区域ID" />
      </el-form-item>

      <!-- Residual #236: areaName/ownerName/preferredCategories already DTO-ready. -->
      <el-form-item label="区域名称" prop="areaName">
        <el-input v-model="form.areaName" placeholder="选填，区域显示名" maxlength="100" />
      </el-form-item>

      <el-form-item label="成员数" prop="memberCount">
        <el-input-number v-model="form.memberCount" :min="0" :max="1000000" class="full-width" />
      </el-form-item>

      <!-- Residual #231: activityLevel is DTO-ready and already filterable on list. -->
      <el-form-item label="活跃度" prop="activityLevel">
        <el-select
          v-model="form.activityLevel"
          placeholder="选填，活跃度"
          clearable
          class="full-width"
        >
          <el-option
            v-for="option in activityLevelOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="标签" prop="tags">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          placeholder="输入后回车创建标签"
          class="full-width"
        >
          <el-option v-for="tag in form.tags" :key="tag" :label="tag" :value="tag" />
        </el-select>
      </el-form-item>

      <el-form-item label="偏好品类" prop="preferredCategories">
        <el-select
          v-model="form.preferredCategories"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          placeholder="输入后回车添加偏好品类"
          class="full-width"
        >
          <el-option v-for="cat in form.preferredCategories" :key="cat" :label="cat" :value="cat" />
        </el-select>
      </el-form-item>

      <el-form-item label="负责人ID" prop="ownerId">
        <el-input v-model="form.ownerId" placeholder="选填，负责人用户ID" />
      </el-form-item>

      <el-form-item label="负责人姓名" prop="ownerName">
        <el-input v-model="form.ownerName" placeholder="选填，负责人显示名" maxlength="100" />
      </el-form-item>

      <el-form-item label="负责人电话" prop="ownerPhone">
        <!-- Residual #258: list/detail return maskPhone — leave blank on edit to keep. -->
        <el-input
          v-model="form.ownerPhone"
          :placeholder="isEdit ? '留空则不修改（列表为脱敏值）' : '选填'"
          maxlength="32"
        />
      </el-form-item>

      <el-form-item label="来源" prop="source">
        <el-input v-model="form.source" placeholder="选填，如：手工录入 / 批量导入" />
      </el-form-item>

      <el-form-item label="备注" prop="note">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          placeholder="选填"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import AppleButton from '../../../components/AppleButton.vue';

interface CommunityFormModel {
  groupName: string;
  groupType: string;
  areaId: string;
  // Residual #236: DTO-ready remaining write fields.
  areaName: string;
  memberCount: number;
  activityLevel: string;
  tags: string[];
  preferredCategories: string[];
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  source: string;
  note: string;
}

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    modelValue?: boolean;
    submitting: boolean;
    isEdit: boolean;
    form: CommunityFormModel;
  }>(),
  { visible: undefined, modelValue: undefined }
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [value: boolean];
  submit: [];
}>();

const formRef = ref<FormInstance>();

const dialogVisible = computed({
  get: () => props.visible ?? props.modelValue ?? false,
  set: (value: boolean) => {
    emit('update:visible', value);
    emit('update:modelValue', value);
  }
});

const groupTypeOptions = [
  { label: '微信群', value: 'wechat_group' },
  { label: '朋友圈', value: 'moments' },
  { label: '商家转发', value: 'merchant_share' }
];

const activityLevelOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' }
];

const rules: FormRules<CommunityFormModel> = {
  groupName: [
    { required: true, message: '请输入社群名称', trigger: 'blur' },
    { max: 50, message: '社群名称不能超过 50 个字符', trigger: 'blur' }
  ],
  groupType: [{ required: true, message: '请选择社群类型', trigger: 'change' }],
  areaId: [{ required: true, message: '请输入所属区域ID', trigger: 'blur' }]
};

function handleOpen(): void {
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  if (props.submitting) return;
  const instance = formRef.value;
  if (instance) {
    const valid = await instance.validate().catch(() => false);
    if (!valid) return;
  }
  emit('submit');
}
</script>

<style scoped>
.full-width {
  width: 100%;
}
</style>

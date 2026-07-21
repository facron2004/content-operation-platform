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

      <el-form-item label="成员数" prop="memberCount">
        <el-input-number v-model="form.memberCount" :min="0" :max="1000000" class="full-width" />
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

      <el-form-item label="负责人ID" prop="ownerId">
        <el-input v-model="form.ownerId" placeholder="选填，负责人用户ID" />
      </el-form-item>

      <el-form-item label="来源" prop="source">
        <el-input v-model="form.source" placeholder="选填，如：手工录入 / 批量导入" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

interface CommunityFormModel {
  groupName: string;
  groupType: string;
  areaId: string;
  memberCount: number;
  tags: string[];
  ownerId: string;
  source: string;
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

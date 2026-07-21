<template>
  <el-dialog
    v-model="dialogVisible"
    title="发布任务"
    width="480px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="备注" prop="note">
        <el-input v-model="form.note" type="textarea" :rows="3" placeholder="选填,发布备注" />
      </el-form-item>
      <el-form-item label="凭证链接" prop="evidenceUrl">
        <el-input
          v-model="form.evidenceUrl"
          placeholder="选填,发布凭证 URL(http/https)"
          clearable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleConfirm">确认发布</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

const props = defineProps<{
  modelValue?: boolean;
  visible?: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:visible': [value: boolean];
  confirm: [data: { evidenceUrl?: string; note?: string }];
}>();

const dialogVisible = computed({
  get: () => props.modelValue ?? props.visible ?? false,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    emit('update:visible', value);
  }
});

const formRef = ref<FormInstance>();
const form = reactive({ evidenceUrl: '', note: '' });

const rules: FormRules = {
  evidenceUrl: [
    {
      pattern: /^https?:\/\/.+/i,
      message: '凭证链接需以 http:// 或 https:// 开头',
      trigger: 'blur'
    }
  ],
  note: [{ max: 200, message: '备注不能超过 200 字', trigger: 'blur' }]
};

function handleOpen() {
  form.evidenceUrl = '';
  form.note = '';
  formRef.value?.clearValidate();
}

async function handleConfirm() {
  if (formRef.value) {
    try {
      await formRef.value.validate();
    } catch {
      return;
    }
  }
  emit('confirm', {
    evidenceUrl: form.evidenceUrl.trim() || undefined,
    note: form.note.trim() || undefined
  });
}
</script>

<style scoped>
:deep(.el-form-item__label) {
  font-weight: 500;
}
</style>

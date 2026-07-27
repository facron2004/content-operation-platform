<template>
  <el-dialog
    v-model="dialogVisible"
    title="标记任务失败"
    width="480px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="失败原因" prop="failReason">
        <el-input
          v-model="form.failReason"
          type="textarea"
          :rows="3"
          placeholder="必填,请描述任务失败的原因"
        />
      </el-form-item>
      <el-form-item label="失败分类" prop="failCategory">
        <el-select
          v-model="form.failCategory"
          placeholder="选填,选择失败分类"
          clearable
          class="full-width"
        >
          <el-option
            v-for="opt in categoryOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <!-- Residual #242: FailTaskDto.evidenceUrl parity with publish dialog. -->
      <el-form-item label="凭证链接" prop="evidenceUrl">
        <el-input
          v-model="form.evidenceUrl"
          placeholder="选填,失败凭证 URL(http/https)"
          clearable
        />
      </el-form-item>
      <el-form-item label="备注" prop="note">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="选填,补充说明" />
      </el-form-item>
    </el-form>
    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="danger" :loading="submitting" @click="handleConfirm">
        确认失败
      </AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import AppleButton from '../../../components/AppleButton.vue';

const props = defineProps<{
  modelValue?: boolean;
  visible?: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:visible': [value: boolean];
  confirm: [
    data: { failReason: string; failCategory?: string; evidenceUrl?: string; note?: string }
  ];
}>();

const dialogVisible = computed({
  get: () => props.modelValue ?? props.visible ?? false,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    emit('update:visible', value);
  }
});

const formRef = ref<FormInstance>();
const form = reactive({ failReason: '', failCategory: '', evidenceUrl: '', note: '' });

const rules: FormRules = {
  failReason: [
    { required: true, message: '请输入失败原因', trigger: 'blur' },
    { min: 2, max: 500, message: '失败原因长度需在 2-500 字之间', trigger: 'blur' }
  ],
  evidenceUrl: [
    {
      pattern: /^https?:\/\/.+/i,
      message: '凭证链接需以 http:// 或 https:// 开头',
      trigger: 'blur'
    }
  ],
  note: [{ max: 200, message: '备注不能超过 200 字', trigger: 'blur' }]
};

const categoryOptions = [
  { label: '内容违规', value: 'content_issue' },
  { label: '套餐已下架', value: 'package_offline' },
  { label: '库存不足', value: 'out_of_stock' },
  { label: '渠道/群不可用', value: 'channel_issue' },
  { label: '账号受限', value: 'account_restricted' },
  { label: '排期问题', value: 'schedule_issue' },
  { label: '其他', value: 'other' }
];

function handleOpen() {
  form.failReason = '';
  form.failCategory = '';
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
    failReason: form.failReason.trim(),
    failCategory: form.failCategory || undefined,
    evidenceUrl: form.evidenceUrl.trim() || undefined,
    note: form.note.trim() || undefined
  });
}
</script>

<style scoped>
.full-width {
  width: 100%;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}
</style>

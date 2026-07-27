<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量导入社群"
    width="640px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-form ref="formRef" :model="importForm" :rules="rules" label-position="top">
      <el-form-item label="数据格式" prop="source">
        <el-select v-model="importForm.source" placeholder="请选择数据格式" class="full-width">
          <el-option label="CSV（逗号分隔）" value="csv" />
          <el-option label="JSON（数组）" value="json" />
        </el-select>
      </el-form-item>

      <el-form-item label="数据内容" prop="rawData">
        <el-input
          v-model="importForm.rawData"
          type="textarea"
          :rows="12"
          :placeholder="placeholderText"
          spellcheck="false"
          class="raw-data-editor"
        />
      </el-form-item>

      <el-alert type="info" :closable="false" show-icon class="upload-hint">
        <template #title>
          请粘贴{{ importForm.source === 'csv' ? ' CSV ' : ' JSON ' }}文本内容。
          <template v-if="importForm.source === 'csv'">
            首行为表头，需包含 groupName、groupType、areaId，可选 memberCount、tags（以 |
            分隔）、ownerId、source。
          </template>
          <template v-else>
            需为社群对象数组，每项至少包含 groupName、groupType、areaId 字段。
          </template>
        </template>
      </el-alert>
    </el-form>

    <template #footer>
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="importing" @click="handleSubmit">导入</AppleButton>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import AppleButton from '../../../components/AppleButton.vue';

type ImportSource = 'csv' | 'json';

interface ImportFormModel {
  source: ImportSource;
  rawData: string;
}

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    modelValue?: boolean;
    importing: boolean;
  }>(),
  { visible: undefined, modelValue: undefined }
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [value: boolean];
  submit: [data: ImportFormModel];
}>();

const formRef = ref<FormInstance>();
const importForm = reactive<ImportFormModel>({ source: 'csv', rawData: '' });

const dialogVisible = computed({
  get: () => props.visible ?? props.modelValue ?? false,
  set: (value: boolean) => {
    emit('update:visible', value);
    emit('update:modelValue', value);
  }
});

const placeholderText = computed(() =>
  importForm.source === 'csv'
    ? 'groupName,groupType,areaId,memberCount,tags,ownerId,source\n城东宝妈群,wechat_group,AREA-01,235,宝妈|高活跃,user-9,手工录入'
    : '[\n  {\n    "groupName": "城东宝妈群",\n    "groupType": "wechat_group",\n    "areaId": "AREA-01",\n    "memberCount": 235,\n    "tags": ["宝妈", "高活跃"]\n  }\n]'
);

const rules: FormRules<ImportFormModel> = {
  source: [{ required: true, message: '请选择数据格式', trigger: 'change' }],
  rawData: [
    { required: true, message: '请粘贴需要导入的数据内容', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (!value || !value.trim()) {
          callback(new Error('数据内容不能为空'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

function handleOpen(): void {
  importForm.source = 'csv';
  importForm.rawData = '';
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  if (props.importing) return;
  const instance = formRef.value;
  if (instance) {
    const valid = await instance.validate().catch(() => false);
    if (!valid) return;
  }
  emit('submit', { source: importForm.source, rawData: importForm.rawData.trim() });
}
</script>

<style scoped>
.full-width {
  width: 100%;
}

.raw-data-editor :deep(textarea) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.upload-hint {
  margin-top: 4px;
}
</style>

<script setup lang="ts">
import SettingsCreateForm from './SettingsCreateForm.vue';
const form = defineModel<{
  type: string;
  name: string;
  merchantId: string;
  comment: string;
  payloadText: string;
}>('form', { required: true });
defineProps<{
  submitting: boolean;
  typeOptions: Array<{ label: string; value: string }>;
  ruleTypeLabels: Record<string, string>;
}>();
const dialogVisible = defineModel<boolean>({ default: false });
defineEmits<{ 'type-change': []; 'load-default': []; submit: [] }>();
</script>
<template>
  <el-dialog v-model="dialogVisible" title="新建规则配置（新版本）" width="640px">
    <SettingsCreateForm
      :form="form"
      :rule-type-labels="ruleTypeLabels"
      @type-change="$emit('type-change')"
      @load-default="$emit('load-default')"
    >
      <template #type-options>
        <el-option
          v-for="opt in typeOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </template>
    </SettingsCreateForm>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="$emit('submit')">创建</el-button>
    </template>
  </el-dialog>
</template>

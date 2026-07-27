<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
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
      <AppleButton variant="secondary" @click="dialogVisible = false">取消</AppleButton>
      <AppleButton variant="primary" :loading="submitting" @click="$emit('submit')">
        创建
      </AppleButton>
    </template>
  </el-dialog>
</template>

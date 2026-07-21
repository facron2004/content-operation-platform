<template>
  <el-form-item :label="label" class="task-schedule-picker">
    <el-date-picker
      :model-value="modelValue"
      type="datetime"
      placeholder="选择排期时间"
      value-format="YYYY-MM-DDTHH:mm:ss"
      :disabled="disabled"
      clearable
      class="task-schedule-picker-input"
      @update:model-value="handleUpdate"
    />
  </el-form-item>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string | null;
    disabled?: boolean;
    label?: string;
  }>(),
  { disabled: false, label: '排期时间' }
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

function handleUpdate(value: string | null) {
  emit('update:modelValue', value || null);
}
</script>

<style scoped>
.task-schedule-picker {
  width: 100%;
}

.task-schedule-picker-input {
  width: 100%;
}
</style>

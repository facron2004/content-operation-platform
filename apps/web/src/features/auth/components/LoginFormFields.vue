<template>
  <el-form-item label="用户名">
    <el-input
      :model-value="username"
      placeholder="请输入用户名"
      :disabled="loading"
      @update:model-value="$emit('update:username', String($event))"
    />
  </el-form-item>
  <el-form-item label="密码">
    <el-input
      :model-value="password"
      type="password"
      show-password
      placeholder="请输入密码"
      :disabled="loading"
      @keyup.enter="$emit('submit')"
      @update:model-value="$emit('update:password', String($event))"
    />
  </el-form-item>
</template>
<script setup lang="ts">
defineProps<{ username: string; password: string; loading: boolean }>();
defineEmits<{
  submit: [];
  'update:username': [value: string];
  'update:password': [value: string];
}>();
</script>

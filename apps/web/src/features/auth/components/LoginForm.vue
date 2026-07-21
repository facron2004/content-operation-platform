<template>
  <el-form label-position="top" class="login-form" @submit.prevent="$emit('submit')">
    <LoginFormFields
      :username="username"
      :password="password"
      :loading="loading"
      @update:username="$emit('update:username', $event)"
      @update:password="$emit('update:password', $event)"
      @submit="$emit('submit')"
    />
    <LoginFormActions
      :loading="loading"
      @submit="$emit('submit')"
      @fill-defaults="$emit('fill-defaults')"
    />
    <LoginFormHint :error="error" />
  </el-form>
</template>
<script setup lang="ts">
import LoginFormHint from './LoginFormHint.vue';
import LoginFormFields from './LoginFormFields.vue';
import LoginFormActions from './LoginFormActions.vue';
defineProps<{ username: string; password: string; loading: boolean; error: string | null }>();
defineEmits<{
  submit: [];
  'fill-defaults': [];
  'update:username': [value: string];
  'update:password': [value: string];
}>();
</script>

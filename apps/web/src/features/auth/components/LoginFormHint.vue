<script setup lang="ts">
defineProps<{ error: string | null }>();
</script>
<template>
  <p v-if="error" class="login-error">{{ error }}</p>
  <p v-else class="login-hint">
    开发环境默认账号：
    <code>admin</code>
    /
    <code>contentops2024</code>
    （生产环境请在
    <code>.env</code>
    中覆盖
    <code>AUTH_USERNAME</code>
    /
    <code>AUTH_PASSWORD</code>
    ）
  </p>
</template>

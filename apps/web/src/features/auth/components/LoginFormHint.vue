<script setup lang="ts">
defineProps<{ error: string | null }>();
</script>
<template>
  <p v-if="error" class="login-error">{{ error }}</p>
  <p v-else class="login-hint">
    请使用运维分配的账号登录。本地开发请在服务端配置 AUTH_USERNAME / AUTH_PASSWORD。
  </p>
</template>

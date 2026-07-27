<template>
  <div class="login-page">
    <section class="login-shell">
      <LoginVisual />
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark">OP</div>
          <div>
            <h2>欢迎回来</h2>
            <p>登录后继续处理内容、预警和生成任务</p>
          </div>
        </div>
        <LoginForm
          v-model:username="form.username"
          v-model:password="form.password"
          :loading="loading"
          :error="error"
          @submit="handleLogin"
        />
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import LoginVisual from '../features/auth/components/LoginVisual.vue';
import LoginForm from '../features/auth/components/LoginForm.vue';
import { useLoginPage } from '../features/auth/composables/useLoginPage';
const { form, loading, error, handleLogin } = useLoginPage();
</script>
<style src="../styles/views/login.css" scoped></style>

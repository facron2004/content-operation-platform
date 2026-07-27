<template>
  <div class="not-found-view">
    <div class="not-found-content">
      <h1 class="error-code">404</h1>
      <p class="error-message">页面不存在</p>
      <p class="error-hint">你访问的页面不存在或已被移除</p>
      <AppleButton variant="primary" @click="goHome">返回首页</AppleButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppleButton from '../components/AppleButton.vue';
const router = useRouter(),
  goHome = () => router.push({ name: 'dashboard' });
</script>
<style src="../styles/views/not-found.css" scoped></style>

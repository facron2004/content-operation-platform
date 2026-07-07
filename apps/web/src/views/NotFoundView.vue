<template>
  <div class="not-found-view">
    <div class="not-found-content">
      <h1 class="error-code">404</h1>
      <p class="error-message">页面不存在</p>
      <p class="error-hint">你访问的页面不存在或已被移除</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const goHome = () => router.push({ name: 'dashboard' });
</script>

<style scoped>
.not-found-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.error-code {
  font-size: 6rem;
  font-weight: 700;
  color: var(--el-color-primary);
  margin: 0;
  line-height: 1;
  opacity: 0.6;
}

.error-message {
  font-size: 1.5rem;
  color: var(--el-text-color-primary);
  margin: 1rem 0 0.5rem;
}

.error-hint {
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
  margin-bottom: 2rem;
}
</style>

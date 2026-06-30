<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark">OP</div>
        <h2>本地生活作战台</h2>
        <p>内容运营中台 · 登录</p>
      </div>

      <el-form label-position="top" class="login-form" @submit.prevent="handleLogin">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" :disabled="loading" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button type="primary" class="login-button" :loading="loading" @click="handleLogin">
          登录
        </el-button>
        <p v-if="error" class="login-error">{{ error }}</p>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';

import { useRoute } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const error = ref<string | null>(null);

const form = reactive({
  username: '',
  password: ''
});

async function handleLogin() {
  if (!form.username.trim() || !form.password.trim()) {
    error.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
    const res = await axios.post(`${baseURL}/auth/login`, {
      username: form.username.trim(),
      password: form.password.trim()
    });
    authStore.setAuth(res.data.access_token, res.data.username);
    ElMessage.success('登录成功');
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: unknown) {
    const msg =
      axios.isAxiosError(e) && e.response?.data?.message
        ? e.response.data.message
        : '登录失败，请检查网络连接';
    error.value = msg;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%);
}

.login-card {
  width: 380px;
  padding: 40px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.login-brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #1e3a5f, #3b82f6);
  color: white;
  border-radius: 12px;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

.login-brand h2 {
  margin: 0;
  font-size: 20px;
  color: #1a1a2e;
}

.login-brand p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6c757d;
}

.login-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #334155;
}

.login-button {
  width: 100%;
  margin-top: 8px;
}

.login-error {
  margin: 12px 0 0;
  color: #ef4444;
  font-size: 13px;
  text-align: center;
}
</style>

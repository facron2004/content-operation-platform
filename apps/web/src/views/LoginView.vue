<template>
  <div class="login-page">
    <section class="login-shell">
      <div class="login-visual">
        <div class="visual-badge">Local Life Ops</div>
        <h1>本地生活作战台</h1>
        <p>将套餐、文案、预警和复盘串成一条工作流，让每一次登录都直接进入可行动的运营界面。</p>
        <div class="visual-points">
          <div class="point-card">
            <strong>运营中台</strong>
            <span>今日作战、套餐分析、社群动作统一管理</span>
          </div>
          <div class="point-card">
            <strong>AI 生成</strong>
            <span>作战卡、群发文案、朋友圈文案快速输出</span>
          </div>
          <div class="point-card">
            <strong>结果复盘</strong>
            <span>基于效果数据持续调整推荐和分发策略</span>
          </div>
        </div>
      </div>

      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark">OP</div>
          <div>
            <h2>欢迎回来</h2>
            <p>登录后继续处理内容、预警和生成任务</p>
          </div>
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
            登录进入作战台
          </el-button>
          <p v-if="error" class="login-error">{{ error }}</p>
        </el-form>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { extractErrorMessage } from '../services/http-client';

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
    const rawRedirect = route.query.redirect;
    const redirect = (Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect) || '/';
    router.push(redirect);
  } catch (e: unknown) {
    error.value = extractErrorMessage(e, '登录失败，请检查网络连接');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.18), transparent 24%),
    radial-gradient(circle at bottom right, rgba(19, 78, 74, 0.14), transparent 28%),
    linear-gradient(135deg, #eef4ff 0%, #f7faff 54%, #eef7f4 100%);
}

.login-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(340px, 420px);
  width: min(1080px, 100%);
  overflow: hidden;
  border: 1px solid rgba(228, 232, 239, 0.92);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px);
}

.login-visual {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  padding: 40px;
  color: #0f172a;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.22), transparent 34%),
    linear-gradient(160deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0));
}

.visual-badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.login-visual h1 {
  max-width: 10ch;
  margin: 18px 0 0;
  font-size: clamp(32px, 4vw, 54px);
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.login-visual p {
  max-width: 46ch;
  margin: 16px 0 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.8;
}

.visual-points {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.point-card {
  min-height: 128px;
  padding: 16px;
  border: 1px solid rgba(228, 232, 239, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: var(--shadow-soft);
}

.point-card strong {
  display: block;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.point-card span {
  display: block;
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.login-card {
  padding: 36px;
  background: rgba(255, 255, 255, 0.96);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}

.brand-mark {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(135deg, #1d4ed8, #0f766e);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  box-shadow: 0 12px 30px rgba(29, 78, 216, 0.28);
}

.login-brand h2 {
  margin: 0;
  color: var(--ink);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
}

.login-brand p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.login-form :deep(.el-form-item__label) {
  color: var(--ink-soft);
  font-weight: 700;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.login-button {
  width: 100%;
  margin-top: 8px;
  height: 44px;
}

.login-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px solid rgba(220, 38, 38, 0.16);
  border-radius: 10px;
  background: rgba(255, 241, 242, 0.82);
  color: var(--danger);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 960px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-visual {
    padding: 28px 24px;
  }

  .visual-points {
    grid-template-columns: 1fr;
  }

  .login-card {
    padding: 28px 24px;
  }
}
</style>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">OP</div>
        <div>
          <strong>本地生活作战台</strong>
          <span>JeeSite 实时运营</span>
        </div>
      </div>
      <div class="sidebar-meta">
        <div class="meta-pill">
          <span class="meta-label">当前角色</span>
          <strong>{{ roleStore.roleLabel }}</strong>
        </div>
        <div
          class="meta-pill"
          :class="cookieStatus?.isValid ? 'meta-pill-success' : 'meta-pill-danger'"
        >
          <span class="meta-label">数据源</span>
          <strong>{{ cookieStatus?.isValid ? '在线同步' : '需要更新' }}</strong>
        </div>
      </div>
      <el-menu router :default-active="$route.path" class="nav-menu">
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>今日作战台</span>
        </el-menu-item>
        <el-menu-item index="/recommendations">
          <el-icon><TrendCharts /></el-icon>
          <span>套餐页</span>
        </el-menu-item>
        <el-menu-item index="/generate">
          <el-icon><EditPen /></el-icon>
          <span>作战卡生成</span>
        </el-menu-item>
        <el-menu-item index="/communities">
          <el-icon><ChatLineRound /></el-icon>
          <span>社群运营</span>
        </el-menu-item>
        <el-menu-item index="/alerts">
          <el-icon><Warning /></el-icon>
          <span>异常预警</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><Checked /></el-icon>
          <span>文稿审核</span>
        </el-menu-item>
        <el-menu-item index="/performance">
          <el-icon><Histogram /></el-icon>
          <span>效果看板</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="topbar-copy">
          <p class="eyebrow">Local Life Ops</p>
          <h1>{{ pageTitle }}</h1>
          <p class="topbar-subtitle">围绕内容生产、异常响应与数据回收的一体化运营工作台。</p>
        </div>
        <div class="topbar-actions">
          <NotificationCenter />

          <el-button circle class="icon-button" @click="historyVisible = true">
            <el-icon><Clock /></el-icon>
          </el-button>

          <ThemeSwitch />

          <el-button
            class="cookie-status-btn"
            :type="cookieStatus?.isValid ? 'success' : 'danger'"
            plain
            size="default"
            @click="openCookieDialog"
          >
            <el-badge :is-dot="!cookieStatus?.isValid" class="badge-dot">
              <span>JeeSite: {{ cookieStatus?.isValid ? '已连接' : '未连接' }}</span>
            </el-badge>
          </el-button>

          <el-select
            v-model="roleStore.currentRole"
            class="role-select"
            @change="roleStore.setRole"
          >
            <el-option
              v-for="option in roleStore.roleOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-tag effect="light" type="primary">{{ roleStore.roleLabel }}</el-tag>
        </div>
      </header>
      <RouterView />
    </main>

    <el-dialog
      v-model="cookieDialogVisible"
      title="JeeSite 数据源连接配置"
      width="500px"
      append-to-body
      destroy-on-close
    >
      <div class="cookie-dialog-content">
        <el-alert
          v-if="!cookieStatus?.isValid"
          title="JeeSite 认证已失效"
          type="error"
          description="因为多次登录失败触发验证码或 Cookie 过期，系统无法自动抓取库存。请在浏览器中手动登录后更新 Cookie。"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />
        <el-alert
          v-else
          title="JeeSite 连通正常"
          type="success"
          description="系统正使用有效 Session 自动同步最新数据。无需额外操作。"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />

        <div class="status-items">
          <div class="status-item">
            <span>账号名</span>
            <strong>{{ cookieStatus?.username || '未配置' }}</strong>
          </div>
          <div class="status-item">
            <span>连接状态</span>
            <el-tag :type="cookieStatus?.isValid ? 'success' : 'danger'" size="small">
              {{ cookieStatus?.isValid ? '在线' : '离线' }}
            </el-tag>
          </div>
          <div v-if="(cookieStatus?.cooldownMinutes ?? 0) > 0" class="status-item">
            <span>安全冷却</span>
            <span class="warning-text">
              自动登录冷却中（余 {{ cookieStatus?.cooldownMinutes }} 分钟）
            </span>
          </div>
          <div v-if="cookieStatus?.lastLoginTime" class="status-item">
            <span>上次成功登录</span>
            <span>{{ formatTime(cookieStatus.lastLoginTime) }}</span>
          </div>
          <div class="status-item code-row">
            <span>Session ID</span>
            <code>{{ cookieStatus?.maskedCookie || '无' }}</code>
          </div>
        </div>

        <div class="manual-cookie-section">
          <h4>手动更新 Cookie</h4>
          <ol class="instructions">
            <li>
              在浏览器中访问并登录：
              <a href="https://zdm.zhsh1.cn/a/login" target="_blank" rel="noopener noreferrer">
                zdm.zhsh1.cn/a/login
              </a>
            </li>
            <li>输入账号密码及验证码登录成功。</li>
            <li>
              在页面任意处按
              <strong>F12</strong>
              ，进入 Console 输入
              <code>document.cookie</code>
              。
            </li>
            <li>复制输出的完整字符串，粘贴在下方。</li>
          </ol>

          <el-input
            v-model="newCookieString"
            type="textarea"
            :rows="3"
            placeholder="粘贴 document.cookie 输出的字符串..."
            resize="none"
            style="margin-top: 10px"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="cookieDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="updatingCookie" @click="saveCookie">
            验证并更新
          </el-button>
        </div>
      </template>
    </el-dialog>

    <OperationHistory v-model:visible="historyVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ChatLineRound,
  Checked,
  DataBoard,
  EditPen,
  Histogram,
  TrendCharts,
  Warning,
  Clock
} from '@element-plus/icons-vue';
import { useRoleStore } from '../stores/role';
import { api } from '../services/api';
import NotificationCenter from './NotificationCenter.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import OperationHistory from './OperationHistory.vue';

const roleStore = useRoleStore();
const historyVisible = ref(false);

const cookieDialogVisible = ref(false);
const updatingCookie = ref(false);
const newCookieString = ref('');
type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;
const cookieStatus = ref<CookieStatus | null>(null);

const fetchCookieStatus = async () => {
  try {
    cookieStatus.value = await api.getCookieStatus();
  } catch {
    // 拦截器已处理错误提示
  }
};

const openCookieDialog = async () => {
  await fetchCookieStatus();
  newCookieString.value = '';
  cookieDialogVisible.value = true;
};

const saveCookie = async () => {
  if (!newCookieString.value.trim()) {
    ElMessage.warning('请输入 Cookie 字符串');
    return;
  }
  updatingCookie.value = true;
  try {
    const res = await api.updateCookie(newCookieString.value.trim());
    if (res.success) {
      ElMessage.success('Cookie 更新成功，连接已恢复！');
      cookieDialogVisible.value = false;
      await fetchCookieStatus();
    } else {
      ElMessage.error(res.error || '更新失败，请检查 Cookie 是否有效');
    }
  } catch {
    // 拦截器处理
  } finally {
    updatingCookie.value = false;
  }
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  return date.toLocaleString();
};

let cookiePoller: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  fetchCookieStatus();
  cookiePoller = setInterval(fetchCookieStatus, 30000);
});

onUnmounted(() => {
  if (cookiePoller) clearInterval(cookiePoller);
});
const route = useRoute();

const titles: Record<string, string> = {
  dashboard: '今日作战台',
  recommendations: '套餐页',
  'package-analysis': '套餐详情分析',
  generate: '作战卡生成',
  communities: '社群运营',
  alerts: '异常预警中心',
  audit: '文稿审核',
  performance: '内容效果看板'
};

const pageTitle = computed(() => titles[String(route.name)] ?? '内容运营中台');
</script>

<style scoped>
.sidebar {
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.brand {
  padding-bottom: 16px;
}

.sidebar-meta {
  display: grid;
  gap: 8px;
  padding: 0 8px 16px;
}

.meta-pill {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.meta-pill strong {
  color: var(--ink);
  font-size: 13px;
  line-height: 1.2;
}

.meta-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.meta-pill-success {
  border-color: rgba(5, 150, 105, 0.2);
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.95), #fff);
}

.meta-pill-success strong {
  color: var(--success);
}

.meta-pill-danger {
  border-color: rgba(220, 38, 38, 0.18);
  background: linear-gradient(180deg, rgba(255, 241, 242, 0.95), #fff);
}

.meta-pill-danger strong {
  color: var(--danger);
}

.nav-menu {
  padding: 0 4px;
}

.workspace {
  min-width: 0;
  padding: 16px 24px 32px;
  overflow-x: hidden;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: -16px -24px 20px;
  padding: 16px 24px 14px;
  backdrop-filter: blur(12px);
  background: rgba(244, 246, 250, 0.82);
  border-bottom: 1px solid rgba(228, 232, 239, 0.95);
}

.topbar-copy {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.topbar h1 {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.topbar-subtitle {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.icon-button {
  box-shadow: var(--shadow-soft);
}

.role-select,
.role-switch {
  min-width: 140px;
  max-width: 180px;
}

.cookie-status-btn {
  margin-right: 12px;
}

.badge-dot :deep(.el-badge__content.is-fixed.is-dot) {
  right: 5px;
  top: 5px;
}

.cookie-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.status-items {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--soft, #f8fafc);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.status-item span {
  color: var(--muted);
}

.status-item strong {
  color: var(--ink);
}

.warning-text {
  color: var(--warning);
  font-weight: 700;
  text-align: right;
}

.code-row code {
  max-width: 280px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #e2e8f0;
  word-break: break-all;
  font-family: monospace;
  font-size: 11px;
}

.manual-cookie-section {
  margin-top: 6px;
}

.manual-cookie-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--ink);
}

.instructions {
  margin: 0;
  padding-left: 20px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.7;
}

.instructions a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}

.instructions a:hover {
  text-decoration: underline;
}

.instructions code {
  background: #f1f5f9;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1280px) {
  .topbar {
    align-items: stretch;
    flex-direction: column;
  }

  .topbar-actions {
    justify-content: flex-start;
  }
}
</style>

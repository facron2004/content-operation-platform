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

    <CookieConfigDialog v-model:visible="cookieDialogVisible" />

    <OperationHistory v-model:visible="historyVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
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
import CookieConfigDialog from './CookieConfigDialog.vue';

const roleStore = useRoleStore();
const historyVisible = ref(false);

const cookieDialogVisible = ref(false);
type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;
const cookieStatus = ref<CookieStatus | null>(null);

const fetchCookieStatus = async () => {
  try {
    cookieStatus.value = await api.getCookieStatus();
  } catch {
    // 拦截器已处理错误提示
  }
};

const openCookieDialog = () => {
  cookieDialogVisible.value = true;
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

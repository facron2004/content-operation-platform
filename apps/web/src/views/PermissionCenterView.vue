<template>
  <section class="page-stack iam-page">
    <header class="iam-hero">
      <div>
        <p class="iam-kicker">ACCESS / CONTROL PLANE</p>
        <h2>权限中心</h2>
        <p class="iam-subtitle">把角色、组织边界和用户授权放在同一个可追溯的控制面。</p>
      </div>
      <div class="iam-hero-meta">
        <div>
          <span>当前租户</span>
          <strong>{{ tenantId }}</strong>
        </div>
        <AppleButton variant="tinted" size="sm" :loading="loading" @click="refreshAll">
          <template #icon>
            <el-icon><Refresh /></el-icon>
          </template>
          刷新
        </AppleButton>
      </div>
    </header>

    <div class="iam-layout">
      <aside class="iam-rail">
        <div class="iam-rail-label">CONTROL SURFACES</div>
        <button
          v-for="item in tabs"
          :key="item.key"
          class="iam-nav-item"
          :class="{ active: activeTab === item.key }"
          type="button"
          @click="activeTab = item.key"
        >
          <span class="iam-nav-icon">
            <el-icon><component :is="item.icon" /></el-icon>
          </span>
          <span class="iam-nav-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
          <span class="iam-nav-count">{{ item.count }}</span>
        </button>
        <div class="iam-rail-note">
          <span class="signal-dot" />
          <div>
            <strong>双写兼容已开启</strong>
            <p>旧角色绑定仍保留，新授权会同步到 IAM 投影。</p>
          </div>
        </div>
      </aside>

      <main class="iam-main">
        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="warning"
          show-icon
          closable
          @close="errorMessage = ''"
        />

        <ErrorAlert :message="writeError" />

        <PermissionRolePanel v-if="activeTab === 'roles'" :controller="controller" />
        <PermissionOrganizationPanel
          v-else-if="activeTab === 'organizations'"
          :controller="controller"
        />
        <PermissionUserPanel v-else :controller="controller" />
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import AppleButton from '../components/AppleButton.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import PermissionOrganizationPanel from '../features/permission-center/PermissionOrganizationPanel.vue';
import PermissionRolePanel from '../features/permission-center/PermissionRolePanel.vue';
import PermissionUserPanel from '../features/permission-center/PermissionUserPanel.vue';
import { usePermissionCenter } from '../features/permission-center/usePermissionCenter';
import '../styles/permission-center.css';

const controller = usePermissionCenter();
const { activeTab, tabs, tenantId, loading, errorMessage, writeError, refreshAll } = controller;
</script>

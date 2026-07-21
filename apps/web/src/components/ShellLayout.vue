<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <ShellSidebar
      :nav-tree="navTree"
      :collapsed="sidebarCollapsed"
      @toggle-collapse="toggleSidebarCollapse"
    />
    <main class="workspace">
      <ShellTopbar
        :page-title="pageTitle"
        :cookie-status="cookieStatus"
        :role-store="roleStore"
        @open-history="historyVisible = true"
        @open-cookie="openCookieDialog"
      />
      <RouterView />
    </main>
    <CookieConfigDialog v-model:visible="cookieDialogVisible" />
    <OperationHistory v-model:visible="historyVisible" />
  </div>
</template>

<script setup lang="ts">
import OperationHistory from './OperationHistory.vue';
import CookieConfigDialog from './CookieConfigDialog.vue';
import ShellSidebar from './ShellSidebar.vue';
import ShellTopbar from './ShellTopbar.vue';
import { useShellLayout } from '../composables/useShellLayout';

const {
  roleStore,
  historyVisible,
  cookieDialogVisible,
  cookieStatus,
  navTree,
  sidebarCollapsed,
  toggleSidebarCollapse,
  openCookieDialog,
  pageTitle
} = useShellLayout();
</script>

<style src="../styles/components/shell-layout.css" scoped></style>

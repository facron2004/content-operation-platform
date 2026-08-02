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
      <!--
        KeepAlive: returning to a list/shell page restores scroll + in-memory state
        instead of remounting + full network reload. Dynamic detail routes use fullPath
        as the cache key so entity A/B don't collide.
      -->
      <RouterView v-slot="{ Component, route }">
        <KeepAlive :max="routeCacheMax">
          <component :is="Component" v-if="Component" :key="viewCacheKey(route)" />
        </KeepAlive>
      </RouterView>
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
import { ROUTE_VIEW_CACHE_MAX, routeViewCacheKey } from '../composables/route-view-cache';

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

const routeCacheMax = ROUTE_VIEW_CACHE_MAX;
const viewCacheKey = routeViewCacheKey;
</script>

<style src="../styles/components/shell-layout.css"></style>

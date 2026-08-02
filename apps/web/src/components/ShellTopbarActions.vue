<template>
  <div class="topbar-actions">
    <NotificationCenter />
    <AppleButton
      icon-only
      variant="secondary"
      class="icon-button"
      title="操作历史"
      aria-label="操作历史"
      @click="$emit('open-history')"
    >
      <template #icon>
        <el-icon><Clock /></el-icon>
      </template>
    </AppleButton>
    <ThemeSwitch />
    <el-badge :is-dot="!cookieStatus?.isValid" class="badge-dot">
      <AppleButton
        class="cookie-status-btn"
        variant="tinted"
        size="sm"
        :data-tone="cookieStatus?.isValid ? 'success' : 'danger'"
        @click="$emit('open-cookie')"
      >
        JeeSite: {{ cookieStatus?.isValid ? '已连接' : '未连接' }}
      </AppleButton>
    </el-badge>
    <!-- Parent passes a live store object; field write is intentional. -->
    <!-- eslint-disable-next-line vue/no-mutating-props -->
    <el-select v-model="roleStore.currentRole" class="role-select" @change="roleStore.setRole">
      <el-option
        v-for="option in roleStore.roleOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </div>
</template>
<script setup lang="ts">
import { Clock } from '@element-plus/icons-vue';
import type { UserRole } from '@content/shared';
import NotificationCenter from './NotificationCenter.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import AppleButton from './AppleButton.vue';
defineProps<{
  cookieStatus: { isValid?: boolean } | null | undefined;
  roleStore: {
    currentRole: UserRole;
    roleLabel: string;
    roleOptions: Array<{ value: string; label: string }>;
    setRole: (role: UserRole) => void;
  };
}>();
defineEmits<{ 'open-history': []; 'open-cookie': [] }>();
</script>
<style scoped>
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.icon-button {
  box-shadow: var(--shadow-soft);
  flex-shrink: 0;
}

.badge-dot {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.badge-dot :deep(.el-badge__content.is-fixed.is-dot) {
  right: 4px;
  top: 4px;
}

.cookie-status-btn {
  margin-right: 0;
  flex-shrink: 0;
}

.role-select {
  min-width: 120px;
  max-width: 148px;
}

@media (max-width: 960px) {
  .topbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>

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
    <el-badge :is-dot="Boolean(cookieStatusError) || !cookieStatus?.isValid" class="badge-dot">
      <AppleButton
        class="cookie-status-btn"
        variant="tinted"
        size="sm"
        :data-tone="cookieStatusError ? 'warning' : cookieStatus?.isValid ? 'success' : 'danger'"
        :title="cookieStatusError || 'JeeSite 数据源连接状态'"
        :aria-label="cookieStatusError || 'JeeSite 数据源连接状态'"
        @click="$emit('open-cookie')"
      >
        JeeSite:
        {{ cookieStatusError ? '状态未知' : cookieStatus?.isValid ? '已连接' : '未连接' }}
      </AppleButton>
    </el-badge>
    <!-- Parent passes a live store object; field write is intentional. -->
    <!-- eslint-disable vue/no-mutating-props -->
    <el-select
      v-model="roleStore.currentRole"
      class="role-select"
      popper-class="role-select-dropdown"
      size="small"
      :placeholder="roleStore.roleLabel || '切换身份'"
      :aria-label="`当前身份：${roleStore.roleLabel}`"
      @change="roleStore.setRole"
    >
      <template #prefix>
        <el-icon class="role-select__icon"><User /></el-icon>
      </template>
      <el-option
        v-for="option in roleStore.roleOptions"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
    <!-- eslint-enable vue/no-mutating-props -->
  </div>
</template>
<script setup lang="ts">
import { Clock, User } from '@element-plus/icons-vue';
import type { UserRole } from '@content/shared';
import NotificationCenter from './NotificationCenter.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import AppleButton from './AppleButton.vue';
defineProps<{
  cookieStatus: { isValid?: boolean } | null | undefined;
  cookieStatusError?: string | null;
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

/* ── Apple-style role selector ───────────────────────────────────────
   Capsule trigger, soft shadow, person icon prefix. Mirrors the visual
   language of AppleButton--secondary so the topbar reads as one toolbar. */
.role-select {
  --el-component-size: 28px;
  min-width: 132px;
  max-width: 168px;
  flex-shrink: 0;
}

.role-select :deep(.el-select__wrapper) {
  min-height: 28px;
  padding: 0 12px 0 8px;
  border-radius: 999px;
  border: 0.5px solid var(--line);
  background: rgba(120, 120, 128, 0.12);
  box-shadow: var(--shadow-soft);
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}

.role-select :deep(.el-select__wrapper:hover) {
  background: rgba(120, 120, 128, 0.18);
  border-color: var(--line-strong);
}

.role-select :deep(.el-select__wrapper.is-focused) {
  background: rgba(120, 120, 128, 0.18);
  border-color: var(--accent);
  box-shadow:
    var(--shadow-soft),
    0 0 0 3px rgba(var(--accent-rgb), 0.24);
}

.role-select :deep(.el-select__wrapper.is-hovering) {
  background: rgba(120, 120, 128, 0.18);
}

.role-select :deep(.el-select__selected-item) {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  line-height: 1;
}

.role-select :deep(.el-select__suffix) {
  --el-select-input-color: var(--muted);
  color: var(--muted);
}

.role-select :deep(.el-select__caret) {
  color: var(--muted);
  font-size: 12px;
}

.role-select__icon {
  color: var(--muted);
  font-size: 14px;
  margin-right: 2px;
}

@media (max-width: 960px) {
  .topbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

/* Dark theme: grey-tinted background washes out on dark surfaces, switch to
   white-tinted translucency like AppleButton--secondary. */
html[data-theme='dark'] .role-select :deep(.el-select__wrapper) {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--line);
}

html[data-theme='dark'] .role-select :deep(.el-select__wrapper:hover),
html[data-theme='dark'] .role-select :deep(.el-select__wrapper.is-focused),
html[data-theme='dark'] .role-select :deep(.el-select__wrapper.is-hovering) {
  background: rgba(255, 255, 255, 0.16);
}
</style>

<!-- Dropdown panel is teleported to <body>, so its styles must be global.
     Trigger styles above stay scoped; only the popper lives here. -->
<style>
.role-select-dropdown.el-select-dropdown {
  border-radius: 12px;
  border: 0.5px solid var(--line);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
  padding: 4px 0;
}

.role-select-dropdown .el-select-dropdown__item {
  font-size: 13px;
  font-weight: 560;
  color: var(--ink-soft);
  letter-spacing: -0.01em;
  border-radius: 8px;
  margin: 2px 6px;
  padding: 0 10px;
  height: 32px;
  line-height: 32px;
}

.role-select-dropdown .el-select-dropdown__item.is-hovering,
.role-select-dropdown .el-select-dropdown__item:hover {
  background: rgba(120, 120, 128, 0.1);
  color: var(--ink);
}

.role-select-dropdown .el-select-dropdown__item.is-selected {
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  font-weight: 620;
}

/* Dark theme: dropdown rows use white-tinted hover instead of grey. */
html[data-theme='dark'] .role-select-dropdown .el-select-dropdown__item.is-hovering,
html[data-theme='dark'] .role-select-dropdown .el-select-dropdown__item:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>

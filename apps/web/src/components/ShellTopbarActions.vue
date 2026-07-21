<template>
  <div class="topbar-actions">
    <NotificationCenter />
    <el-button circle class="icon-button" @click="$emit('open-history')">
      <el-icon><Clock /></el-icon>
    </el-button>
    <ThemeSwitch />
    <el-badge :is-dot="!cookieStatus?.isValid" class="badge-dot">
      <el-button
        class="cookie-status-btn"
        :type="cookieStatus?.isValid ? 'success' : 'danger'"
        plain
        size="default"
        @click="$emit('open-cookie')"
      >
        JeeSite: {{ cookieStatus?.isValid ? '已连接' : '未连接' }}
      </el-button>
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
    <el-tag effect="light" type="primary">{{ roleStore.roleLabel }}</el-tag>
  </div>
</template>
<script setup lang="ts">
import { Clock } from '@element-plus/icons-vue';
import type { UserRole } from '@content/shared';
import NotificationCenter from './NotificationCenter.vue';
import ThemeSwitch from './ThemeSwitch.vue';
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

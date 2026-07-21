<template>
  <header class="topbar">
    <div class="topbar-copy">
      <p class="eyebrow">Local Life Ops</p>
      <h1>{{ pageTitle }}</h1>
      <p class="topbar-subtitle">围绕内容生产、异常响应与数据回收的一体化运营工作台。</p>
    </div>
    <ShellTopbarActions
      :cookie-status="cookieStatus"
      :role-store="roleStore"
      @open-history="$emit('open-history')"
      @open-cookie="$emit('open-cookie')"
    />
  </header>
</template>
<script setup lang="ts">
import type { UserRole } from '@content/shared';
import ShellTopbarActions from './ShellTopbarActions.vue';
defineProps<{
  pageTitle: string;
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

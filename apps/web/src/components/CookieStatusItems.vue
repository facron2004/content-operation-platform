<template>
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
      <span>{{ formatTime(String(cookieStatus.lastLoginTime)) }}</span>
    </div>
    <div class="status-item code-row">
      <span>Session ID</span>
      <code>{{ cookieStatus?.maskedCookie || '无' }}</code>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  cookieStatus: {
    isValid?: boolean;
    username?: string | null;
    cooldownMinutes?: number;
    lastLoginTime?: number | string | null;
    maskedCookie?: string | null;
  } | null;
  formatTime: (value: string) => string;
}>();
</script>

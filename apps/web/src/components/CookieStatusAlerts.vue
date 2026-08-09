<template>
  <el-alert
    v-if="error"
    title="数据源状态读取失败"
    type="error"
    :description="error"
    show-icon
    :closable="false"
    style="margin-bottom: 16px"
  />
  <el-alert
    v-else-if="cookieStatus?.state === 'pending_config'"
    title="外部数据源待配置"
    type="warning"
    description="请先配置数据源地址；如未提供有效 Cookie，还需要配置账号和密码或手动粘贴 Cookie。"
    show-icon
    :closable="false"
    style="margin-bottom: 16px"
  />
  <el-alert
    v-else-if="!cookieStatus?.isValid"
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
</template>
<script setup lang="ts">
defineProps<{
  cookieStatus: { isValid?: boolean; state?: string } | null;
  error?: string | null;
}>();
</script>

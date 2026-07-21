<template>
  <el-alert
    v-if="!cookieStatus?.isValid"
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
defineProps<{ cookieStatus: { isValid?: boolean } | null }>();
</script>

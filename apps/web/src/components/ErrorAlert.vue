<script setup lang="ts">
/* 通用页面级错误提示 —— 替代各 view 重复的 el-alert v-if="loadError" 模板。行为上等价:`type="error"` + show-icon + closable,class 默认 `page-alert`。 */ defineProps<{
  message?: string | null;
}>();
</script>
<template>
  <el-alert v-if="message" :title="message" type="error" show-icon closable class="page-alert" />
</template>

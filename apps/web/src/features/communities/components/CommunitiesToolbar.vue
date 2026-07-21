<template>
  <div class="community-toolbar">
    <div>
      <p class="eyebrow">Community Operations</p>
      <h2>社群运营模块</h2>
    </div>
    <el-button type="primary" :loading="loading" @click="$emit('refresh')">刷新社群匹配</el-button>
  </div>
</template>
<script setup lang="ts">
defineProps<{ loading: boolean }>();
defineEmits<{ refresh: [] }>();
</script>

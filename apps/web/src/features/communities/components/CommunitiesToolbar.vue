<template>
  <div class="community-toolbar">
    <div>
      <p class="eyebrow">Community Operations</p>
      <h2>社群运营模块</h2>
    </div>
    <AppleButton variant="primary" :loading="loading" @click="$emit('refresh')">
      刷新社群匹配
    </AppleButton>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ loading: boolean }>();
defineEmits<{ refresh: [] }>();
</script>

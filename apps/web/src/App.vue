<template>
  <RouterView />
</template>

<script setup lang="ts">
import { useGlobalShortcuts } from './composables/useKeyboardShortcuts';

// 启用全局快捷键
useGlobalShortcuts();
</script>

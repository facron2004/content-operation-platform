<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button :icon="themeIcon" circle />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="light" :class="{ active: theme === 'light' }">
          <el-icon><Sunny /></el-icon>
          浅色模式
        </el-dropdown-item>
        <el-dropdown-item command="dark" :class="{ active: theme === 'dark' }">
          <el-icon><Moon /></el-icon>
          深色模式
        </el-dropdown-item>
        <el-dropdown-item command="auto" :class="{ active: theme === 'auto' }">
          <el-icon><Monitor /></el-icon>
          跟随系统
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Sunny, Moon, Monitor } from '@element-plus/icons-vue';
import { themeService } from '../services/theme.service';

const theme = themeService.getTheme();
const effectiveTheme = themeService.getEffectiveTheme();

const themeIcon = computed(() => {
  if (theme.value === 'auto') return Monitor;
  return effectiveTheme.value === 'dark' ? Moon : Sunny;
});

function handleCommand(command: 'light' | 'dark' | 'auto') {
  themeService.setTheme(command);
}
</script>

<style scoped>
.active {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>

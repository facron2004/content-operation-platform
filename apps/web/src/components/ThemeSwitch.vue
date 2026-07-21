<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <span class="theme-trigger-wrap">
      <el-button :icon="themeIcon" circle class="theme-trigger" />
    </span>
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
const theme = themeService.themeRef;
const effectiveTheme = themeService.effectiveThemeRef;
const themeIcon = computed(() =>
  theme.value === 'auto' ? Monitor : effectiveTheme.value === 'dark' ? Moon : Sunny
);
function handleCommand(command: 'light' | 'dark' | 'auto') {
  themeService.setTheme(command);
}
</script>
<style src="../styles/components/theme-switch.css" scoped></style>

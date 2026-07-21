<template>
  <aside class="sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="brand">
      <img class="brand-mark" src="/favicon.svg" alt="本地生活运营中台" width="36" height="36" />
      <div v-if="!collapsed" class="brand-text">
        <strong>本地生活运营中台</strong>
        <span>运营数据驾驶舱</span>
      </div>
    </div>

    <el-menu
      :key="menuKey"
      router
      :default-active="activePath"
      :default-openeds="openKeys"
      :collapse="collapsed"
      class="nav-menu"
      :collapse-transition="false"
    >
      <template v-for="node in navTree" :key="node.kind === 'group' ? node.key : node.path">
        <el-menu-item v-if="node.kind === 'item'" :index="node.path" :disabled="node.disabled">
          <el-icon v-if="node.icon && iconMap[node.icon]">
            <component :is="iconMap[node.icon]" />
          </el-icon>
          <template #title>
            <span>{{ node.title }}</span>
          </template>
        </el-menu-item>

        <el-sub-menu v-else :index="node.key">
          <template #title>
            <el-icon v-if="node.icon && iconMap[node.icon]">
              <component :is="iconMap[node.icon]" />
            </el-icon>
            <span>{{ node.title }}</span>
          </template>
          <el-menu-item v-for="child in node.children" :key="child.path" :index="child.path">
            <el-icon v-if="child.icon && iconMap[child.icon]">
              <component :is="iconMap[child.icon]" />
            </el-icon>
            <template #title>
              <span>{{ child.title }}</span>
            </template>
          </el-menu-item>
        </el-sub-menu>
      </template>
    </el-menu>

    <button type="button" class="sidebar-collapse-btn" @click="$emit('toggle-collapse')">
      <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
      <span v-if="!collapsed">收起菜单</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Expand, Fold } from '@element-plus/icons-vue';
import type { NavNode } from '../composables/shell-layout-nav';
import { ICON_MAP } from '../composables/shell-layout-nav';
import { resolveOpenGroupKeys } from '../composables/shell-layout-nav';

defineProps<{
  navTree: NavNode[];
  collapsed: boolean;
}>();
defineEmits<{ 'toggle-collapse': [] }>();

const route = useRoute();
const iconMap = ICON_MAP;
const activePath = computed(() => route.path);
const openKeys = computed(() => resolveOpenGroupKeys(route.path));
const menuKey = computed(() => `${activePath.value}|${openKeys.value.join(',')}`);
</script>

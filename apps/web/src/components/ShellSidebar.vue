<template>
  <aside class="sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="brand">
      <img class="brand-mark" src="/favicon.svg" alt="" width="36" height="36" />
      <div v-if="!collapsed" class="brand-text">
        <strong>本地生活运营中台</strong>
        <span>运营数据驾驶舱</span>
      </div>
    </div>

    <nav class="nav-rail" :aria-label="collapsed ? '主导航（已收起）' : '主导航'">
      <template v-for="node in navTree" :key="node.kind === 'group' ? node.key : node.path">
        <!-- Leaf item -->
        <RouterLink
          v-if="node.kind === 'item'"
          :to="node.disabled ? route.path : node.path"
          class="nav-item"
          :class="{
            'is-active': !node.disabled && isActive(node.path),
            'is-disabled': node.disabled
          }"
          :aria-disabled="node.disabled || undefined"
          :tabindex="node.disabled ? -1 : undefined"
          :title="collapsed ? node.title : undefined"
          @click="onLeafClick($event, node)"
          @mouseenter="warm(node.path, node.disabled)"
          @focusin="warm(node.path, node.disabled)"
        >
          <span class="nav-item__icon" aria-hidden="true">
            <el-icon v-if="node.icon && iconMap[node.icon]">
              <component :is="iconMap[node.icon]" />
            </el-icon>
          </span>
          <span v-if="!collapsed" class="nav-item__label">{{ node.title }}</span>
        </RouterLink>

        <!-- Group -->
        <div
          v-else
          class="nav-group"
          :class="{ 'is-open': isGroupOpen(node.key), 'is-active': isGroupActive(node) }"
        >
          <button
            type="button"
            class="nav-item nav-group__toggle"
            :class="{ 'is-active': isGroupActive(node) && !isGroupOpen(node.key) && collapsed }"
            :aria-expanded="isGroupOpen(node.key)"
            :aria-controls="`nav-group-${node.key}`"
            :title="collapsed ? node.title : undefined"
            @click="toggleGroup(node)"
          >
            <span class="nav-item__icon" aria-hidden="true">
              <el-icon v-if="node.icon && iconMap[node.icon]">
                <component :is="iconMap[node.icon]" />
              </el-icon>
            </span>
            <span v-if="!collapsed" class="nav-item__label">{{ node.title }}</span>
            <span v-if="!collapsed" class="nav-group__chevron" aria-hidden="true">
              <el-icon><ArrowRight /></el-icon>
            </span>
          </button>

          <div
            v-show="!collapsed && isGroupOpen(node.key)"
            :id="`nav-group-${node.key}`"
            class="nav-group__children"
            role="group"
            :aria-label="node.title"
          >
            <RouterLink
              v-for="child in node.children"
              :key="child.path"
              :to="child.path"
              class="nav-item nav-item--child"
              :class="{ 'is-active': isActive(child.path) }"
              @mouseenter="warm(child.path)"
              @focusin="warm(child.path)"
            >
              <span class="nav-item__icon" aria-hidden="true">
                <el-icon v-if="child.icon && iconMap[child.icon]">
                  <component :is="iconMap[child.icon]" />
                </el-icon>
              </span>
              <span class="nav-item__label">{{ child.title }}</span>
            </RouterLink>
          </div>
        </div>
      </template>
    </nav>

    <button
      type="button"
      class="sidebar-collapse-btn"
      :title="collapsed ? '展开菜单' : '收起菜单'"
      :aria-label="collapsed ? '展开菜单' : '收起菜单'"
      :aria-expanded="!collapsed"
      @click="$emit('toggle-collapse')"
    >
      <el-icon aria-hidden="true">
        <component :is="collapsed ? Expand : Fold" />
      </el-icon>
      <span v-if="!collapsed">收起菜单</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, Expand, Fold } from '@element-plus/icons-vue';
import type { NavGroupNode, NavLeaf, NavNode } from '../composables/shell-layout-nav';
import { ICON_MAP, resolveOpenGroupKeys } from '../composables/shell-layout-nav';
import { prefetchRouteComponents } from '../composables/route-view-cache';

const props = defineProps<{
  navTree: NavNode[];
  collapsed: boolean;
}>();
defineEmits<{ 'toggle-collapse': [] }>();

const route = useRoute();
const router = useRouter();
const iconMap = ICON_MAP;

/** Keep one working center open; navigation automatically follows the active path. */
const openGroups = ref<Set<string>>(new Set(resolveOpenGroupKeys(route.path)));

watch(
  () => route.path,
  (path) => {
    const auto = resolveOpenGroupKeys(path);
    if (!auto.length) return;
    openGroups.value = new Set(auto);
  }
);

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/');
}

function isGroupOpen(key: string) {
  return openGroups.value.has(key);
}

function isGroupActive(node: NavGroupNode) {
  return (
    node.children.some((c) => isActive(c.path)) ||
    (node.aliases?.some((alias) => isActive(alias)) ?? false)
  );
}

function toggleGroup(node: NavGroupNode) {
  // Collapsed: jump to first child instead of expanding inline.
  if (props.collapsed) {
    const first = node.children[0];
    if (first) {
      warm(first.path);
      void router.push(first.path);
    }
    return;
  }
  const next = new Set(openGroups.value);
  if (next.has(node.key)) next.delete(node.key);
  else {
    next.clear();
    next.add(node.key);
  }
  openGroups.value = next;
}

function onLeafClick(event: MouseEvent, node: NavLeaf) {
  if (node.disabled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function warm(path: string, disabled?: boolean) {
  if (disabled) return;
  prefetchRouteComponents(router, path);
}
</script>

<style scoped src="../styles/components/shell-sidebar.css"></style>

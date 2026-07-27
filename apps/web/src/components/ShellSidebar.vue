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

/** User-toggled open groups; auto-open active path groups. */
const openGroups = ref<Set<string>>(new Set(resolveOpenGroupKeys(route.path)));

watch(
  () => route.path,
  (path) => {
    const auto = resolveOpenGroupKeys(path);
    if (!auto.length) return;
    const next = new Set(openGroups.value);
    for (const key of auto) next.add(key);
    openGroups.value = next;
  }
);

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/');
}

function isGroupOpen(key: string) {
  return openGroups.value.has(key);
}

function isGroupActive(node: NavGroupNode) {
  return node.children.some((c) => isActive(c.path));
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
  else next.add(node.key);
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

<style scoped>
/* ===== Apple-style sidebar (no Element Plus menu) ===== */

.sidebar {
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.07), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  display: flex;
  flex-direction: column;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'PingFang SC',
    'Noto Sans SC', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.sidebar.is-collapsed {
  padding-left: 8px;
  padding-right: 8px;
}

/* ---- Brand ---- */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 18px;
  flex-shrink: 0;
  min-width: 0;
}

.sidebar.is-collapsed .brand {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.brand-mark {
  display: block;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.brand-text {
  min-width: 0;
  flex: 1 1 auto;
}

.brand strong {
  display: block;
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.brand span {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  letter-spacing: -0.005em;
}

/* ---- Nav rail ---- */
.nav-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 2px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.12) transparent;
}

.nav-rail::-webkit-scrollbar {
  width: 6px;
}

.nav-rail::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.12);
  border-radius: 999px;
}

/* Shared item / group toggle */
.nav-item {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
  box-sizing: border-box;
}

.nav-item:hover:not(.is-disabled):not(.is-active) {
  background: rgba(120, 120, 128, 0.1);
  color: var(--ink);
}

.nav-item:active:not(.is-disabled) {
  transform: scale(0.985);
}

.nav-item:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.45);
  outline-offset: 1px;
}

.nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  box-shadow: inset 0 0 0 0.5px var(--accent-line);
}

.nav-item.is-disabled {
  opacity: 0.42;
  cursor: not-allowed;
  color: var(--muted);
}

.nav-item__icon {
  display: grid;
  place-items: center;
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  color: #8b96a8;
  font-size: 17px;
  transition: color 0.15s ease;
}

.nav-item:hover:not(.is-disabled) .nav-item__icon {
  color: #667085;
}

.nav-item.is-active .nav-item__icon {
  color: var(--accent);
}

.nav-item__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Collapsed: icon-only square pills */
.sidebar.is-collapsed .nav-item {
  justify-content: center;
  gap: 0;
  padding: 0;
  min-height: 40px;
  width: 40px;
  margin-inline: auto;
}

.sidebar.is-collapsed .nav-item__icon {
  flex-basis: 20px;
  width: 20px;
  height: 20px;
  font-size: 18px;
}

/* ---- Group ---- */
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group.is-active > .nav-group__toggle:not(.is-active) {
  color: var(--ink);
}

.nav-group.is-active > .nav-group__toggle:not(.is-active) .nav-item__icon {
  color: var(--accent);
}

.nav-group__chevron {
  display: grid;
  place-items: center;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: #98a2b3;
  font-size: 12px;
  transition:
    transform 0.18s ease,
    color 0.15s ease;
}

.nav-group.is-open > .nav-group__toggle .nav-group__chevron {
  transform: rotate(90deg);
  color: var(--muted);
}

.nav-group__children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 4px;
}

.nav-item--child {
  min-height: 34px;
  padding-left: 18px;
  font-weight: 500;
  font-size: 12.5px;
  color: var(--muted);
}

.nav-item--child .nav-item__icon {
  font-size: 15px;
  color: #9aa5b5;
}

.nav-item--child.is-active {
  font-weight: 700;
  color: var(--accent);
}

.nav-item--child.is-active .nav-item__icon {
  color: var(--accent);
}

/* ---- Collapse control ---- */
.sidebar-collapse-btn {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 0.5px solid rgba(60, 60, 67, 0.12);
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.1);
  color: #3a3a3c;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  box-shadow: none;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}

.sidebar-collapse-btn:hover {
  background: rgba(120, 120, 128, 0.16);
  color: var(--ink);
}

.sidebar-collapse-btn:active {
  transform: scale(0.98);
}

.sidebar-collapse-btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.45);
  outline-offset: 1px;
}

.sidebar-collapse-btn .el-icon {
  font-size: 15px;
}

.sidebar.is-collapsed .sidebar-collapse-btn {
  left: 8px;
  right: 8px;
  width: 40px;
  height: 40px;
  margin-inline: auto;
  padding: 0;
  border-radius: 12px;
}

/* Dark theme */
:global([data-theme='dark']) .sidebar {
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 32%),
    linear-gradient(180deg, #131826 0%, #0f1420 100%);
}

:global([data-theme='dark']) .nav-item:hover:not(.is-disabled):not(.is-active) {
  background: rgba(255, 255, 255, 0.06);
}

:global([data-theme='dark']) .sidebar-collapse-btn {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--ink-soft);
}

:global([data-theme='dark']) .sidebar-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ink);
}
</style>

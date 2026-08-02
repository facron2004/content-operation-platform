import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoleStore } from '../stores/role';
import { api } from '../services/api';
import { PAGE_TITLES, buildNavTree } from './shell-layout-nav';
import { collectNavLeafPaths, prefetchNavPaths } from './route-view-cache';

/** After sidebar width transitions, tables/charts often keep the previous measure. */
function reflowWorkspaceAfterSidebarToggle() {
  window.scrollTo({ left: 0 });

  // Clear echarts inline widths first so % hosts can shrink with the grid column.
  document.querySelectorAll<HTMLElement>('.chart-shell, .chart-panel').forEach((node) => {
    if (node.style.width) node.style.width = '';
    if (node.style.height) node.style.height = '';
  });

  // Double-rAF: wait one frame for grid tracks to settle, then one for layout.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));

      document.querySelectorAll('.el-table').forEach((el) => {
        const exposed = (
          el as unknown as {
            __vueParentComponent?: { exposed?: { doLayout?: () => void } };
          }
        ).__vueParentComponent?.exposed;
        exposed?.doLayout?.();
      });
    });
  });
}

export function useShellLayout() {
  const roleStore = useRoleStore();
  const route = useRoute();
  const router = useRouter();
  const historyVisible = ref(false);
  const cookieDialogVisible = ref(false);
  const sidebarCollapsed = ref(false);
  type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;
  const cookieStatus = ref<CookieStatus | null>(null);
  const navTree = computed(() =>
    buildNavTree(roleStore.hasServerSession ? roleStore.permissions : undefined)
  );

  const fetchCookieStatus = async () => {
    try {
      cookieStatus.value = await api.getCookieStatus();
    } catch {
      /* interceptor handles toast */
    }
  };

  let cookiePoller: ReturnType<typeof setInterval> | null = null;
  let reflowTimer: ReturnType<typeof setTimeout> | null = null;
  onMounted(() => {
    fetchCookieStatus();
    cookiePoller = setInterval(fetchCookieStatus, 30000);
    // Idle-warm every sidebar leaf so the first click rarely pays chunk cost.
    prefetchNavPaths(router, collectNavLeafPaths(navTree.value));
  });
  onUnmounted(() => {
    if (cookiePoller) clearInterval(cookiePoller);
    if (reflowTimer) clearTimeout(reflowTimer);
  });

  return {
    roleStore,
    historyVisible,
    cookieDialogVisible,
    cookieStatus,
    navTree,
    sidebarCollapsed,
    toggleSidebarCollapse: () => {
      sidebarCollapsed.value = !sidebarCollapsed.value;
      // Wait for the 0.2s width/margin transition, then force dependents to remeasure.
      if (reflowTimer) clearTimeout(reflowTimer);
      reflowTimer = setTimeout(() => {
        reflowTimer = null;
        reflowWorkspaceAfterSidebarToggle();
      }, 220);
    },
    openCookieDialog: () => {
      cookieDialogVisible.value = true;
    },
    pageTitle: computed(() => PAGE_TITLES[String(route.name)] ?? '本地生活运营中台')
  };
}

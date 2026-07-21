import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useRoleStore } from '../stores/role';
import { api } from '../services/api';
import { PAGE_TITLES, buildNavTree } from './shell-layout-nav';

export function useShellLayout() {
  const roleStore = useRoleStore();
  const route = useRoute();
  const historyVisible = ref(false);
  const cookieDialogVisible = ref(false);
  const sidebarCollapsed = ref(false);
  type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;
  const cookieStatus = ref<CookieStatus | null>(null);
  const navTree = computed(() => buildNavTree());

  const fetchCookieStatus = async () => {
    try {
      cookieStatus.value = await api.getCookieStatus();
    } catch {
      /* interceptor handles toast */
    }
  };

  let cookiePoller: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    fetchCookieStatus();
    cookiePoller = setInterval(fetchCookieStatus, 30000);
  });
  onUnmounted(() => {
    if (cookiePoller) clearInterval(cookiePoller);
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
    },
    openCookieDialog: () => {
      cookieDialogVisible.value = true;
    },
    pageTitle: computed(() => PAGE_TITLES[String(route.name)] ?? '本地生活运营中台')
  };
}

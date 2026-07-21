import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRoleStore } from '../../../stores/role';
import { usePackageNavigation } from '../../../utils/navigation';
import { useDashboard } from './useDashboard';
import { DASHBOARD_FOCUS_LABELS } from '../dashboard-focus';
export function useDashboardPage() {
  const router = useRouter(),
    roleStore = useRoleStore();
  const { loading, loadError, consoleData, activeFocus, summary, todayText, load } = useDashboard(
    computed(() => roleStore.currentRole)
  );
  const { goAnalysis: openAnalysis, goBattleCard } = usePackageNavigation(router);
  const activeFocusLabel = computed(() => DASHBOARD_FOCUS_LABELS[activeFocus.value] ?? '全局视角');
  onMounted(load);
  return {
    loading,
    loadError,
    consoleData,
    activeFocus,
    summary,
    todayText,
    load,
    openAnalysis,
    goBattleCard,
    activeFocusLabel
  };
}

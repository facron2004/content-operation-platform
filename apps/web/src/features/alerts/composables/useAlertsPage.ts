import { computed, onMounted, ref } from 'vue';
import type { OperationAlert } from '@content/shared';
import { useRoleStore } from '../../../stores/role';
import { usePackageNavigation } from '../../../utils/navigation';
import { useAlerts } from './useAlerts';
export function useAlertsPage() {
  const router = useRouter(),
    roleStore = useRoleStore(),
    currentRole = computed(() => roleStore.currentRole);
  const drawerVisible = ref(false),
    selectedAlert = ref<(OperationAlert & { priorityScore?: number }) | null>(null),
    alertsState = useAlerts(currentRole),
    { goAnalysis, goBattleCard } = usePackageNavigation(router);
  onMounted(() => alertsState.load());
  return {
    ...alertsState,
    drawerVisible,
    selectedAlert,
    goAnalysis,
    goBattleCard,
    openAlert: (alert: OperationAlert & { priorityScore?: number }) => {
      selectedAlert.value = alert;
      drawerVisible.value = true;
    }
  };
}

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { OperationAlert } from '@content/shared';
import { useRoleStore } from '../../../stores/role';
import { usePackageNavigation } from '../../../utils/navigation';
import { useAlerts } from './useAlerts';
export function useAlertsPage() {
  const router = useRouter(),
    roleStore = useRoleStore(),
    currentRole = computed(() => roleStore.currentRole),
    canResolve = computed(
      () =>
        roleStore.permissions.includes('content:write') &&
        roleStore.effectiveRoles.some((role) => role === 'admin' || role === 'platform_operator')
    );
  const drawerVisible = ref(false),
    selectedAlert = ref<(OperationAlert & { priorityScore?: number }) | null>(null),
    alertsState = useAlerts(currentRole, canResolve),
    { goAnalysis, goBattleCard } = usePackageNavigation(router);
  onMounted(() => alertsState.load());
  return {
    ...alertsState,
    canResolve,
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

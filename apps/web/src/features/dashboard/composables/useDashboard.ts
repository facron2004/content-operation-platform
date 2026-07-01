import { computed, ref, watch, type Ref } from 'vue';
import type { OperationAlert, OperationCard } from '@content/shared';
import { api, type ConsoleResponse } from '../../../services/api';
import { clearDashboardCache } from '../../../services/cache.service';

export interface ConsoleSummary {
  sellingCount: number;
  mustPushCount: number;
  riskCount: number;
  hotOpportunityCount: number;
  slowMovingCount: number;
  communityTaskCount: number;
  avgScore: number;
  dangerAlertCount: number;
  warningAlertCount: number;
  activeAlertCount: number;
  resolvedAlertCount: number;
  updatedAt: string;
  dataSource: string;
  sellingOnly: boolean;
}

export interface CommunityTask {
  taskId: string;
  groupName: string;
  plannedTime: string;
  channel: string;
  packageId: string;
  reason: string;
}

export interface OperationConsoleData {
  date: string;
  summary: ConsoleSummary;
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityTask[];
  yesterdayReview: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] };
  alerts: OperationAlert[];
}

const emptyConsoleData: OperationConsoleData = {
  date: '',
  summary: {
    sellingCount: 0,
    mustPushCount: 0,
    riskCount: 0,
    hotOpportunityCount: 0,
    slowMovingCount: 0,
    communityTaskCount: 0,
    avgScore: 0,
    dangerAlertCount: 0,
    warningAlertCount: 0,
    activeAlertCount: 0,
    resolvedAlertCount: 0,
    updatedAt: '',
    dataSource: 'JeeSite',
    sellingOnly: true
  },
  mustPushPackages: [],
  riskPackages: [],
  hotOpportunities: [],
  slowMovingPackages: [],
  communityTasks: [],
  yesterdayReview: { date: '', whatHappened: [], tomorrowSuggestions: [] },
  alerts: []
};

/** Safely map API response to console data with type-safe defaults */
function mapConsoleResponse(raw: ConsoleResponse): OperationConsoleData {
  return {
    date: raw.date ?? emptyConsoleData.date,
    summary: {
      sellingCount: raw.summary?.sellingCount ?? 0,
      mustPushCount: raw.summary?.mustPushCount ?? 0,
      riskCount: raw.summary?.riskCount ?? 0,
      hotOpportunityCount: raw.summary?.hotOpportunityCount ?? 0,
      slowMovingCount: raw.summary?.slowMovingCount ?? 0,
      communityTaskCount: raw.summary?.communityTaskCount ?? 0,
      avgScore: raw.summary?.avgScore ?? 0,
      dangerAlertCount: raw.summary?.dangerAlertCount ?? 0,
      warningAlertCount: raw.summary?.warningAlertCount ?? 0,
      activeAlertCount: raw.summary?.activeAlertCount ?? 0,
      resolvedAlertCount: raw.summary?.resolvedAlertCount ?? 0,
      updatedAt: raw.summary?.updatedAt ?? '',
      dataSource: raw.summary?.dataSource ?? 'JeeSite',
      sellingOnly: raw.summary?.sellingOnly ?? true
    },
    mustPushPackages: raw.mustPushPackages ?? [],
    riskPackages: raw.riskPackages ?? [],
    hotOpportunities: raw.hotOpportunities ?? [],
    slowMovingPackages: raw.slowMovingPackages ?? [],
    communityTasks: raw.communityTasks ?? [],
    yesterdayReview: raw.yesterdayReview ?? emptyConsoleData.yesterdayReview,
    alerts: raw.alerts ?? []
  };
}

export function useDashboard(role: Ref<string | undefined>) {
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const consoleData = ref<OperationConsoleData>(emptyConsoleData);
  const activeFocus = ref('all');

  const summary = computed(() => consoleData.value.summary);
  const todayText = computed(() => new Date().toISOString().slice(0, 10));

  const load = async (force = false) => {
    loading.value = true;
    loadError.value = null;
    try {
      if (force) clearDashboardCache();
      const data = await api.getTodayOperationConsole({ role: role.value });
      consoleData.value = mapConsoleResponse(data as ConsoleResponse);
    } catch {
      loadError.value = '作战台数据加载失败，请稍后重试；如反复出现请重新登录';
      consoleData.value = emptyConsoleData;
    } finally {
      loading.value = false;
    }
  };

  watch(role, () => {
    load(true);
  });

  return {
    loading,
    loadError,
    consoleData,
    activeFocus,
    summary,
    todayText,
    load
  };
}

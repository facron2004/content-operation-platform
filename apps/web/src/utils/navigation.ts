import type { Router } from 'vue-router';
/** * 套餐相关导航函数 — 消除 DashboardView、AlertsView 中重复的导航代码。 */ export function usePackageNavigation(
  router: Router
) {
  const goBattleCard = (packageId: string) => {
    router.push({ path: '/generate', query: { packageId, mode: 'battle-card' } });
  };
  const goAnalysis = (packageId: string) => {
    router.push(`/packages/${packageId}`);
  };
  const goGenerate = (packageId: string) => {
    router.push({ path: '/generate', query: { packageId } });
  };
  return { goBattleCard, goAnalysis, goGenerate };
}

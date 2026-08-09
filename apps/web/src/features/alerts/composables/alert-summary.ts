import { computed } from 'vue';
import type { OperationAlert } from '@content/shared';

export function useAlertTableSummary(
  alerts: () => Array<OperationAlert & { priorityScore?: number }>
) {
  const currentPageDangerCount = computed(
    () => alerts().filter((item) => item.level === 'danger').length
  );
  const currentPageWarningCount = computed(
    () => alerts().filter((item) => item.level === 'warning').length
  );
  const currentPageAvgScore = computed(() => {
    const rows = alerts();
    if (!rows.length) return 0;
    return (
      Math.round(
        (rows.reduce((sum, item) => sum + (item.priorityScore ?? 0), 0) / rows.length) * 10
      ) / 10
    );
  });
  const currentPagePackageCount = computed(
    () => new Set(alerts().map((item) => item.packageId)).size
  );
  const alertRowClassName = ({ row }: { row: OperationAlert & { priorityScore?: number } }) =>
    row.level === 'danger' ? 'row-danger' : row.level === 'warning' ? 'row-warning' : '';
  return {
    currentPageDangerCount,
    currentPageWarningCount,
    currentPageAvgScore,
    currentPagePackageCount,
    alertRowClassName
  };
}

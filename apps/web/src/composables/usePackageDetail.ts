import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { RecommendPackageItem } from '@content/shared';
import { currentPrice } from '@content/shared';
import { api, type PackageDetailResponse } from '../services/api';
import { extractErrorMessage } from '../services/http-client';
import { formatMoney } from '../utils/labels';

export type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
export function buildFeedFacts(
  pkg: RecommendPackageItem | undefined,
  packageDetail: PackageDetailData | null
) {
  if (!pkg) return [];
  return [
    { label: '原价', value: formatMoney(pkg.originalPrice) },
    { label: '当前售价', value: formatMoney(currentPrice(pkg)) },
    { label: '今日库存', value: `${pkg.stockLeft} / ${pkg.stockTotal}` },
    { label: '销售判断', value: pkg.inventorySalesLabel },
    {
      label: '明细状态',
      value: packageDetail?.sections.length ? `${packageDetail.sections.length}组` : '未抓取'
    },
    { label: '价格口径', value: '一口价优先，否则临时售价' }
  ];
}

export function buildFeedChecks(
  pkg: RecommendPackageItem | undefined,
  packageDetail: PackageDetailData | null
) {
  if (!pkg) return [];
  const price = currentPrice(pkg);
  return [
    {
      label: '价格',
      ok: price > 0,
      text: price > 0 ? `当前售价 ${formatMoney(price)}` : '缺少有效价格'
    },
    {
      label: '套餐明细',
      ok: !!packageDetail?.sections.length,
      text: packageDetail?.sections.length
        ? `${packageDetail.sections.length} 组明细已喂给 AI`
        : '未抓到明细，会用基础字段兜底'
    },
    {
      label: '使用规则',
      ok: !!pkg.useRules?.length,
      text: pkg.useRules?.length ? `${pkg.useRules.length} 条规则` : '缺少使用规则'
    },
    {
      label: '库存',
      ok: pkg.stockLeft >= 0,
      text: pkg.stockLeft > 0 ? `剩余 ${pkg.stockLeft} 份` : '已售罄，适合承接文案'
    }
  ];
}

type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];
export function formatPackageDetailItems(items: PackageDetailItem[]): string {
  return (
    items.map((item) => `${item.name}${item.quantity ? ` ${item.quantity}` : ''}`).join('、') ||
    '无明细'
  );
}
export type PackageDetailLoadTarget = {
  detailLoading: { value: boolean };
  packageDetail: { value: PackageDetailData | null };
};
export async function loadPackageDetailData(
  packageId: string,
  requestId: number,
  currentRequestId: () => number,
  target: PackageDetailLoadTarget,
  fetchDetail: (id: string) => Promise<PackageDetailResponse>
) {
  target.detailLoading.value = true;
  target.packageDetail.value = null;
  try {
    const response = await fetchDetail(packageId);
    if (requestId !== currentRequestId()) return;
    target.packageDetail.value = response.success && response.data ? response.data : null;
  } catch {
    if (requestId !== currentRequestId()) return;
    target.packageDetail.value = null;
  } finally {
    if (requestId === currentRequestId()) target.detailLoading.value = false;
  }
}
export type { RecommendPackageItem };

export function usePackageDetail(
  selectedPackage: () => RecommendPackageItem | undefined,
  getPackageId: () => string
) {
  const detailLoading = ref(false),
    packageDetail = ref<PackageDetailData | null>(null);
  let packageDetailRequestId = 0;
  const feedFacts = computed(() => buildFeedFacts(selectedPackage(), packageDetail.value)),
    feedChecks = computed(() => buildFeedChecks(selectedPackage(), packageDetail.value));
  const loadPackageDetail = async (packageId: string) => {
    const requestId = ++packageDetailRequestId;
    await loadPackageDetailData(
      packageId,
      requestId,
      () => packageDetailRequestId,
      { detailLoading, packageDetail },
      (id) => api.getPackageDetail(id)
    );
  };
  // Residual #232: 「刷新详情」 must force-refresh via POST, not re-GET the cache.
  const refreshDetail = async () => {
    const packageId = getPackageId();
    if (!packageId) return;
    const requestId = ++packageDetailRequestId;
    await loadPackageDetailData(
      packageId,
      requestId,
      () => packageDetailRequestId,
      { detailLoading, packageDetail },
      async (id) => {
        try {
          const response = await api.refreshPackageDetail(id);
          if (!response.success) {
            ElMessage.error(response.message || '刷新套餐详情失败');
          } else {
            ElMessage.success(response.message || '套餐详情已刷新');
          }
          return response;
        } catch (err) {
          ElMessage.error(extractErrorMessage(err, '刷新套餐详情失败'));
          throw err;
        }
      }
    );
  };
  return {
    detailLoading,
    packageDetail,
    feedFacts,
    feedChecks,
    loadPackageDetail,
    refreshDetail,
    formatDetailItems: formatPackageDetailItems
  };
}

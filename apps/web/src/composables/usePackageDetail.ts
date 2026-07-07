import { computed, ref } from 'vue';
import type { RecommendPackageItem } from '@content/shared';
import { currentPrice } from '@content/shared';
import { api, type PackageDetailResponse } from '../services/api';
import { formatMoney } from '../utils/labels';

type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];

export function usePackageDetail(
  selectedPackage: () => RecommendPackageItem | undefined,
  getPackageId: () => string
) {
  const detailLoading = ref(false);
  const packageDetail = ref<PackageDetailData | null>(null);
  let packageDetailRequestId = 0;

  const feedFacts = computed(() => {
    const pkg = selectedPackage();
    if (!pkg) return [];
    return [
      { label: '原价', value: formatMoney(pkg.originalPrice) },
      { label: '当前售价', value: formatMoney(currentPrice(pkg)) },
      { label: '今日库存', value: `${pkg.stockLeft} / ${pkg.stockTotal}` },
      { label: '销售判断', value: pkg.inventorySalesLabel },
      {
        label: '明细状态',
        value: packageDetail.value?.sections.length
          ? `${packageDetail.value.sections.length}组`
          : '未抓取'
      },
      { label: '价格口径', value: '一口价优先，否则临时售价' }
    ];
  });

  const feedChecks = computed(() => {
    const pkg = selectedPackage();
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
        ok: !!packageDetail.value?.sections.length,
        text: packageDetail.value?.sections.length
          ? `${packageDetail.value.sections.length} 组明细已喂给 AI`
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
  });

  const loadPackageDetail = async (packageId: string) => {
    const requestId = ++packageDetailRequestId;
    detailLoading.value = true;
    packageDetail.value = null;
    try {
      const response = await api.getPackageDetail(packageId);
      if (requestId !== packageDetailRequestId) return;
      packageDetail.value = response.success && response.data ? response.data : null;
    } catch {
      if (requestId !== packageDetailRequestId) return;
      packageDetail.value = null;
    } finally {
      if (requestId === packageDetailRequestId) {
        detailLoading.value = false;
      }
    }
  };

  const refreshDetail = () => {
    const packageId = getPackageId();
    if (packageId) loadPackageDetail(packageId);
  };

  const formatDetailItems = (items: PackageDetailItem[]) =>
    items.map((item) => `${item.name}${item.quantity ? ` ${item.quantity}` : ''}`).join('、') ||
    '无明细';

  return {
    detailLoading,
    packageDetail,
    feedFacts,
    feedChecks,
    loadPackageDetail,
    refreshDetail,
    formatDetailItems
  };
}

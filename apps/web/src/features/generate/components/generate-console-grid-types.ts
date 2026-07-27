import type { RecommendPackageItem } from '@content/shared';
import type { AICopyStatus, PackageDetailResponse } from '../../../services/api';
import type { AIConfigForm, GenerateForm } from '../../../components/AiConfigPanel.vue';
export type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
export type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];
export type GenerateConsoleGridProps = {
  aiStatus: AICopyStatus | null;
  configSaving: boolean;
  loading: boolean;
  generationMode: 'ai' | 'rule' | null;
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
  selectedPackage: RecommendPackageItem | undefined;
  packageDetail: PackageDetailData | null;
  detailLoading: boolean;
  feedFacts: Array<{ label: string; value: string }>;
  feedChecks: Array<{ label: string; ok: boolean; text: string }>;
  formatDetailItems: (items: PackageDetailItem[]) => string;
  // Residual #268: generate package picker first-200 / RECOMMEND_CACHE_CAP honesty.
  truncated?: boolean;
  limit?: number | null;
  matchedCount?: number | null;
};
export type { AIConfigForm, GenerateForm };

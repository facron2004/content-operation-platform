import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  BattleCard,
  GeneratedCopy,
  PackageDetailResponse,
  RecommendPackageItem
} from '@content/shared';

export type GenerationMode = 'ai' | 'rule' | null;
type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type StepState = 'done' | 'active';

function step(key: string, index: string, label: string, description: string, state: StepState) {
  return { key, index, label, description, state };
}

export function buildGenerateWorkflowSteps(params: {
  selectedPackage: RecommendPackageItem | null | undefined;
  packageDetail: PackageDetailData | null | undefined;
  battleCard: BattleCard | null | undefined;
  copies: GeneratedCopy[];
}) {
  const { selectedPackage, packageDetail, battleCard, copies } = params;
  const feedDone = Boolean(packageDetail?.sections.length);
  return [
    step(
      'package',
      '01',
      '选择套餐',
      selectedPackage ? '已选中当前套餐' : '先选一个要生成的套餐',
      selectedPackage ? 'done' : 'active'
    ),
    step(
      'feed',
      '02',
      '检查输入',
      feedDone
        ? `${packageDetail!.sections.length} 组明细已喂给模型`
        : '确认套餐明细、规则和价格口径',
      feedDone ? 'done' : 'active'
    ),
    step(
      'build',
      '03',
      '生成作战卡',
      battleCard ? '作战卡已生成，可继续产文案' : '先生成推荐原因和多场景写法',
      battleCard ? 'done' : 'active'
    ),
    step(
      'output',
      '04',
      '输出文案',
      copies.length ? `已输出 ${copies.length} 条文案` : '生成后进入审核和分发',
      copies.length ? 'done' : 'active'
    )
  ];
}

export function buildGenerationModeLabel(mode: GenerationMode): string {
  if (mode === 'ai') return 'AI 生成中';
  if (mode === 'rule') return '规则兜底';
  return '待选择';
}

export function buildGenerateWorkflow(params: {
  selectedPackage: RecommendPackageItem | null | undefined;
  packageDetail: PackageDetailData | null | undefined;
  battleCard: BattleCard | null | undefined;
  copies: GeneratedCopy[];
}) {
  return buildGenerateWorkflowSteps(params);
}

export async function bootstrapGeneratePage(options: {
  mode: unknown;
  packageId: string;
  loadPackages: () => Promise<void>;
  loadAICopyStatus: () => Promise<void>;
  loadPackageDetail: (packageId: string) => Promise<void>;
  loadBattleCard: () => Promise<void>;
}) {
  await Promise.all([options.loadPackages(), options.loadAICopyStatus()]);
  if (options.packageId) await options.loadPackageDetail(options.packageId);
  if (options.mode === 'battle-card' && options.packageId) await options.loadBattleCard();
}

type StepsIn = {
  selectedPackage: unknown;
  packageDetail: unknown;
  battleCard: unknown;
  copies: unknown[];
};

export function buildGenerateDerived(
  generationMode: Ref<string>,
  selectedPackage: Ref<unknown>,
  packageDetail: Ref<unknown>,
  battleCard: Ref<unknown>,
  copies: Ref<unknown[]>,
  buildGenerationModeLabelFn: (mode: string) => string,
  buildGenerateWorkflowStepsFn: (input: StepsIn) => unknown[]
) {
  return {
    generationModeLabel: () => buildGenerationModeLabelFn(generationMode.value),
    workflowSteps: () =>
      buildGenerateWorkflowStepsFn({
        selectedPackage: selectedPackage.value,
        packageDetail: packageDetail.value,
        battleCard: battleCard.value,
        copies: copies.value
      })
  };
}

export function useGenerateWorkflow(args: {
  generationMode: Ref<GenerationMode>;
  selectedPackage:
    ComputedRef<RecommendPackageItem | undefined> | Ref<RecommendPackageItem | undefined>;
  packageDetail: Ref<PackageDetailData | null>;
  battleCard: Ref<BattleCard | null>;
  copies: Ref<GeneratedCopy[]>;
}) {
  const generationModeLabel = computed(() => buildGenerationModeLabel(args.generationMode.value));
  const workflowSteps = computed(() =>
    buildGenerateWorkflowSteps({
      selectedPackage: args.selectedPackage.value,
      packageDetail: args.packageDetail.value,
      battleCard: args.battleCard.value,
      copies: args.copies.value
    })
  );
  return { generationModeLabel, workflowSteps };
}

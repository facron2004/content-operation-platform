<template>
  <section class="panel ai-feed-panel">
    <SectionHeader
      title="喂给 AI 的套餐详情"
      description="把实际输入给模型的套餐信息拆开看，方便判断哪里需要补充。"
    >
      <template #actions>
        <AppleButton
          size="sm"
          variant="secondary"
          :loading="detailLoading"
          :disabled="!packageId"
          @click="$emit('refresh')"
        >
          <template #icon>
            <el-icon><Refresh /></el-icon>
          </template>
          刷新详情
        </AppleButton>
      </template>
    </SectionHeader>
    <EmptyState
      v-if="!selectedPackage"
      icon="📦"
      title="未选择套餐"
      description="选择套餐后会展示实际传给 AI 的核心信息"
    />
    <PackageFeedBody
      v-else
      :selected-package="selectedPackage"
      :package-detail="packageDetail"
      :detail-loading="detailLoading"
      :feed-facts="feedFacts"
      :feed-checks="feedChecks"
      :format-detail-items="formatDetailItems"
    />
  </section>
</template>
<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import EmptyState from './EmptyState.vue';
import SectionHeader from './SectionHeader.vue';
import PackageFeedBody from './PackageFeedBody.vue';
import AppleButton from './AppleButton.vue';

import type { RecommendPackageItem } from '@content/shared';
import type { PackageDetailResponse } from '../services/api';
export type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
export type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];
export type PackageFeedPanelProps = {
  selectedPackage: RecommendPackageItem | undefined;
  packageDetail: PackageDetailData | null;
  detailLoading: boolean;
  packageId: string;
  feedFacts: Array<{ label: string; value: string }>;
  feedChecks: Array<{ label: string; ok: boolean; text: string }>;
  formatDetailItems: (items: PackageDetailItem[]) => string;
};
defineProps<PackageFeedPanelProps>();
defineEmits<{ refresh: [] }>();
</script>
<style src="../styles/components/package-feed-panel.css" scoped></style>

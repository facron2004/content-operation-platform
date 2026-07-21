<template>
  <div class="ai-feed">
    <PackageFeedHeader :selected-package="selectedPackage" />
    <PackageFeedFactsStrip :feed-facts="feedFacts" :feed-checks="feedChecks" />
    <div class="feed-section-grid">
      <div class="feed-section">
        <h4>卖点</h4>
        <p>{{ selectedPackage.sellingPoints?.join('、') || '无' }}</p>
      </div>
      <div class="feed-section">
        <h4>使用规则</h4>
        <p>{{ selectedPackage.useRules?.join('、') || '无' }}</p>
      </div>
    </div>
    <PackageFeedDetail
      :package-detail="packageDetail"
      :detail-loading="detailLoading"
      :format-detail-items="formatDetailItems"
    />
  </div>
</template>
<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import type { PackageDetailResponse } from '../services/api';
import PackageFeedDetail from './PackageFeedDetail.vue';
import PackageFeedHeader from './PackageFeedHeader.vue';
import PackageFeedFactsStrip from './PackageFeedFactsStrip.vue';
type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];
defineProps<{
  selectedPackage: RecommendPackageItem;
  packageDetail: PackageDetailData | null;
  detailLoading: boolean;
  feedFacts: Array<{ label: string; value: string }>;
  feedChecks: Array<{ label: string; ok: boolean; text: string }>;
  formatDetailItems: (items: PackageDetailItem[]) => string;
}>();
</script>

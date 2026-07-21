<template>
  <div class="feed-detail">
    <div class="feed-detail-head">
      <h4>套餐明细</h4>
      <el-tag size="small" :type="packageDetail ? 'success' : 'info'">
        {{ packageDetail ? `${packageDetail.sections.length}组明细` : '使用基础信息' }}
      </el-tag>
    </div>
    <el-skeleton v-if="detailLoading" :rows="4" animated />
    <div v-else-if="packageDetail?.sections.length" class="detail-section-list">
      <div
        v-for="section in packageDetail.sections"
        :key="section.title + (section.selectionRule ?? '')"
        class="detail-section-item"
      >
        <strong>
          {{ section.title }}{{ section.selectionRule ? `（${section.selectionRule}）` : '' }}
        </strong>
        <p>{{ formatDetailItems(section.items) }}</p>
      </div>
    </div>
    <p v-else class="muted-cell">
      未抓取到套餐明细，AI会使用套餐名称、价格、库存、卖点和规则生成。
    </p>
  </div>
</template>
<script setup lang="ts">
import type { PackageDetailResponse } from '../services/api';
type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];
defineProps<{
  packageDetail: PackageDetailData | null;
  detailLoading: boolean;
  formatDetailItems: (items: PackageDetailItem[]) => string;
}>();
</script>

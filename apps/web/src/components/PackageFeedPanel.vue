<template>
  <section class="panel ai-feed-panel">
    <SectionHeader
      title="喂给 AI 的套餐详情"
      description="把实际输入给模型的套餐信息拆开看，方便判断哪里需要补充。"
    >
      <template #actions>
        <el-button
          size="small"
          :icon="Refresh"
          :loading="detailLoading"
          :disabled="!packageId"
          @click="$emit('refresh')"
        >
          刷新详情
        </el-button>
      </template>
    </SectionHeader>

    <EmptyState
      v-if="!selectedPackage"
      icon="📦"
      title="未选择套餐"
      description="选择套餐后会展示实际传给 AI 的核心信息"
    />

    <div v-else class="ai-feed">
      <div class="feed-title">
        <div>
          <p class="eyebrow">{{ selectedPackage.areaName }} / {{ selectedPackage.category }}</p>
          <h3>{{ selectedPackage.packageName }}</h3>
          <span>{{ selectedPackage.merchantName }}</span>
        </div>
        <div class="feed-tags">
          <el-tag
            v-if="selectedPackage.inventoryFlag !== 'normal'"
            :type="inventoryTagType(selectedPackage.inventoryFlagLevel)"
            effect="dark"
          >
            {{ selectedPackage.inventoryFlagLabel }}
          </el-tag>
          <el-tag :type="salesTagType(selectedPackage.inventorySalesLevel)" effect="plain">
            {{ selectedPackage.inventorySalesLabel }}
          </el-tag>
        </div>
      </div>

      <div class="feed-facts">
        <div v-for="item in feedFacts" :key="item.label" class="feed-fact">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

      <div class="quality-strip">
        <div
          v-for="item in feedChecks"
          :key="item.label"
          class="quality-check"
          :class="{ ok: item.ok }"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.text }}</strong>
        </div>
      </div>

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
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import type { RecommendPackageItem } from '@content/shared';
import type { PackageDetailResponse } from '../services/api';
import { inventoryTagType, salesTagType } from '../utils/labels';
import EmptyState from './EmptyState.vue';
import SectionHeader from './SectionHeader.vue';

type PackageDetailData = NonNullable<PackageDetailResponse['data']>;
type PackageDetailItem = PackageDetailData['sections'][number]['items'][number];

defineProps<{
  selectedPackage: RecommendPackageItem | undefined;
  packageDetail: PackageDetailData | null;
  detailLoading: boolean;
  packageId: string;
  feedFacts: Array<{ label: string; value: string }>;
  feedChecks: Array<{ label: string; ok: boolean; text: string }>;
  formatDetailItems: (items: PackageDetailItem[]) => string;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.ai-feed {
  display: grid;
  gap: 14px;
}

.feed-title,
.feed-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.feed-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 120px;
}

.feed-title h3 {
  margin: 4px 0 6px;
  font-size: 21px;
  line-height: 1.35;
}

.feed-title span,
.feed-section p,
.feed-detail p {
  color: var(--ink-soft);
  line-height: 1.7;
}

.feed-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.quality-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.quality-check {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: var(--warning-soft);
}

.quality-check.ok {
  border-color: #bbf7d0;
  background: var(--success-soft);
}

.quality-check span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.quality-check strong {
  display: block;
  margin-top: 6px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}

.feed-fact,
.feed-section,
.feed-detail {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft, #f8fafc);
}

.feed-fact span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.feed-fact strong {
  display: block;
  margin-top: 6px;
  font-size: 16px;
  word-break: break-word;
}

.feed-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.feed-section h4,
.feed-detail h4 {
  margin: 0 0 8px;
  font-size: 15px;
}

.feed-section p,
.feed-detail p {
  margin: 0;
  word-break: break-word;
}

.detail-section-list {
  display: grid;
  gap: 10px;
}

.detail-section-item {
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.detail-section-item:first-child {
  padding-top: 0;
  border-top: 0;
}

.muted-cell {
  color: var(--muted);
}

@media (max-width: 980px) {
  .feed-facts,
  .quality-strip,
  .feed-section-grid {
    grid-template-columns: 1fr;
  }
}
</style>

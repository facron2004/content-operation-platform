<template>
  <el-card v-loading="loading" class="community-detail-card" shadow="never">
    <template v-if="community">
      <div class="card-header">
        <div class="title-row">
          <h3 class="community-name">{{ community.groupName }}</h3>
          <el-tag size="small" effect="plain">
            {{ groupTypeLabels[community.groupType] ?? community.groupType }}
          </el-tag>
          <el-tag :type="community.isActive ? 'success' : 'danger'" size="small">
            {{ community.isActive ? '启用中' : '已停用' }}
          </el-tag>
        </div>
      </div>

      <el-descriptions :column="2" border class="detail-descriptions">
        <el-descriptions-item label="所属区域">
          {{ community.areaName || community.areaId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="负责人">
          {{ community.ownerName || community.ownerId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="成员数">
          {{ community.memberCount.toLocaleString('zh-CN') }}
        </el-descriptions-item>
        <el-descriptions-item label="活跃度">
          <el-tag :type="activityTagType[community.activityLevel] ?? 'info'" size="small">
            {{ activityLabels[community.activityLevel] ?? community.activityLevel }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="来源">{{ community.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="标签">
          <template v-if="community.tags?.length">
            <el-tag
              v-for="tag in community.tags"
              :key="tag"
              size="small"
              effect="plain"
              class="tag-item"
            >
              {{ tag }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(community.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(community.updatedAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="performance" class="performance-section">
        <h4 class="section-title">任务表现</h4>
        <div class="metric-grid">
          <div class="metric-item">
            <span class="metric-value">{{ performance.visits.toLocaleString('zh-CN') }}</span>
            <span class="metric-label">访问数</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ performance.orders.toLocaleString('zh-CN') }}</span>
            <span class="metric-label">订单数</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">¥{{ formatMoney(performance.gmv) }}</span>
            <span class="metric-label">GMV</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ formatRate(performance.conversionRate) }}</span>
            <span class="metric-label">转化率</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ formatRate(performance.verifyRate) }}</span>
            <span class="metric-label">核销率</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ formatRate(performance.refundRate) }}</span>
            <span class="metric-label">退款率</span>
          </div>
        </div>
      </div>
    </template>

    <el-empty v-else-if="!loading" description="未选择社群" :image-size="100" />
  </el-card>
</template>

<script setup lang="ts">
import type { CommunityGroupEntity, TaskPerformanceResponse } from '@content/shared';

type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';

withDefaults(
  defineProps<{
    community: CommunityGroupEntity | null;
    loading: boolean;
    performance?: TaskPerformanceResponse | null;
  }>(),
  { performance: null }
);

const groupTypeLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

const activityLabels: Record<string, string> = {
  high: '高活跃',
  medium: '中活跃',
  low: '低活跃'
};

const activityTagType: Record<string, TagType> = {
  high: 'success',
  medium: 'warning',
  low: 'info'
};

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}

function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatRate(value: number): string {
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}
</script>

<style scoped>
.community-detail-card {
  width: 100%;
}

.card-header {
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.community-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.detail-descriptions {
  width: 100%;
}

.tag-item {
  margin-right: 4px;
}

.tag-item:last-child {
  margin-right: 0;
}

.performance-section {
  margin-top: 20px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.metric-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

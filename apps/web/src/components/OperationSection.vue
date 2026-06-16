<template>
  <section class="panel" :class="{ 'ops-section-danger': danger }">
    <div class="panel-head">
      <h2>{{ title }}</h2>
    </div>
    <div v-if="items.length" class="ops-card-list">
      <article
        v-for="item in items"
        :key="item.packageId"
        class="ops-card"
        @click="$emit('open', item.packageId)"
      >
        <div class="ops-card-main">
          <div class="ops-card-title">
            <strong>{{ item.packageName }}</strong>
            <el-tag
              :type="item.level === 'S' ? 'success' : item.level === 'D' ? 'danger' : 'warning'"
              effect="plain"
            >
              {{ item.score }}分
            </el-tag>
          </div>
          <div class="ops-card-meta">
            <span>{{ item.currentPrice }}</span>
            <span>{{ item.areaName }}</span>
            <span>库存 {{ item.stockLeft }}</span>
          </div>
          <p>{{ item.reason }}</p>
          <div class="tag-cloud compact">
            <el-tag
              v-for="tag in (item.tags ?? []).slice(0, 4)"
              :key="tag.key"
              :type="riskTagType(tag.level)"
              effect="light"
            >
              {{ tag.label }}
            </el-tag>
          </div>
          <small>下一步：{{ item.nextAction }}</small>
        </div>
        <el-button size="small" type="primary" @click.stop="$emit('generate', item.packageId)">
          作战卡
        </el-button>
      </article>
    </div>
    <EmptyState
      v-else
      icon="空"
      :title="emptyText"
      description="系统会随 JeeSite 数据刷新自动更新"
    />
  </section>
</template>

<script setup lang="ts">
import type { OperationCard } from '@content/shared';
import { riskTagType } from '../utils/labels';
import EmptyState from './EmptyState.vue';

defineProps<{
  title: string;
  items: OperationCard[];
  emptyText: string;
  danger?: boolean;
}>();

defineEmits<{
  open: [packageId: string];
  generate: [packageId: string];
}>();
</script>

<style scoped>
.ops-card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ops-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.ops-card:hover {
  border-color: var(--accent-line);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}

.ops-card-main {
  min-width: 0;
  flex: 1;
}

.ops-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ops-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
}

.ops-card-meta span {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--soft);
  font-variant-numeric: tabular-nums;
}

.ops-card strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.ops-card p {
  margin: 4px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.ops-card small {
  color: var(--muted);
  font-size: 11px;
}

.compact {
  gap: 4px;
}
</style>

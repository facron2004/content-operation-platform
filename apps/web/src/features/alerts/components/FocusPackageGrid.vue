<template>
  <section v-if="topPackages.length" class="panel focus-panel">
    <div class="panel-head">
      <div>
        <h2>优先处理套餐</h2>
        <p>按高危程度、预警数量和动作优先级排序</p>
      </div>
      <span class="muted-cell">点击卡片可直接进入套餐详情</span>
    </div>
    <div class="focus-grid">
      <article
        v-for="item in topPackages"
        :key="item.packageId"
        class="focus-card"
        @click="$emit('navigate', item.packageId)"
      >
        <div class="focus-card-head">
          <strong>{{ item.packageName }}</strong>
          <el-tag :type="item.dangerCount ? 'danger' : 'warning'" effect="dark">
            {{ item.priorityScore }}
          </el-tag>
        </div>
        <p>{{ item.mainReason }}</p>
        <small>{{ item.nextAction }}</small>
        <div class="focus-meta">
          <span>{{ item.areaName }}</span>
          <span>高危 {{ item.dangerCount }}</span>
          <span>警告 {{ item.warningCount }}</span>
        </div>
        <div class="focus-actions">
          <el-button size="small" @click.stop="$emit('navigate', item.packageId)">
            查看套餐
          </el-button>
          <el-button
            size="small"
            type="success"
            :disabled="!item.alertIds?.length"
            :loading="resolving"
            @click.stop="$emit('resolve-batch', item.alertIds, '该套餐预警已处理')"
          >
            处理该套餐
          </el-button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { AlertPackageFocus } from '../composables/useAlerts';

defineProps<{
  topPackages: AlertPackageFocus[];
  resolving: boolean;
}>();

defineEmits<{
  navigate: [packageId: string];
  'resolve-batch': [alertIds: string[], message: string];
}>();
</script>

<style scoped>
.focus-panel {
  overflow: hidden;
}

.panel-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.panel-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.focus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.focus-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease;
}

.focus-card:hover {
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: var(--shadow-soft);
  transform: translateY(-1px);
}

.focus-card-head,
.focus-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.focus-card strong {
  display: block;
  color: var(--ink);
  line-height: 1.45;
}

.focus-card p {
  margin: 10px 0 6px;
  color: var(--ink);
  line-height: 1.5;
}

.focus-card small,
.focus-meta {
  color: var(--muted);
  line-height: 1.5;
}

.focus-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 12px;
}

.focus-meta span {
  padding: 4px 8px;
  border-radius: 8px;
  background: #f4f7fb;
}

.focus-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
</style>

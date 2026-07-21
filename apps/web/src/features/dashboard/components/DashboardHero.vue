<template>
  <section class="ops-hero panel">
    <div class="ops-hero-content">
      <div class="hero-kicker-row">
        <p class="eyebrow">{{ dateLabel }} / 本地生活运营中台</p>
        <el-tag size="small" effect="plain">{{ dataSource }}</el-tag>
      </div>
      <h2>今日运营作战面板</h2>
      <p class="hero-description">
        聚焦销售中套餐、风险预警、爆品机会与社群动作，用一屏把今天必须做的事排清楚。
      </p>
      <div class="ops-source-row">
        <el-tag size="small" type="success" effect="plain">仅销售中</el-tag>
        <span class="source-stat">更新 {{ updatedAtLabel }}</span>
        <span class="source-stat">均分 {{ avgScore }}</span>
        <span class="source-stat">待处理 {{ activeAlertCount }}</span>
        <span class="source-stat">已处理 {{ resolvedAlertCount }}</span>
      </div>
    </div>
    <div class="hero-actions">
      <div class="hero-summary-card">
        <span>今日优先级</span>
        <strong>{{ activeFocusLabel }}</strong>
        <small>切换焦点后，列表会自动聚焦到对应任务</small>
      </div>
      <el-button type="primary" size="small" :loading="loading" @click="$emit('reload')">
        刷新数据
      </el-button>
    </div>
  </section>
</template>
<script setup lang="ts">
defineProps<{
  dateLabel: string;
  dataSource: string;
  updatedAtLabel: string;
  avgScore: number | string;
  activeAlertCount: number | string;
  resolvedAlertCount: number | string;
  activeFocusLabel: string;
  loading: boolean;
}>();
defineEmits<{ reload: [] }>();
</script>

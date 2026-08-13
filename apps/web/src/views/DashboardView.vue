<script setup lang="ts">
import { useDashboardPage } from '../features/dashboard/composables/useDashboardPage';
import DashboardMetrics from '../features/dashboard/components/DashboardMetrics.vue';
import DashboardTaskMetrics from '../features/dashboard/components/DashboardTaskMetrics.vue';
import DashboardContentFunnel from '../features/dashboard/components/DashboardContentFunnel.vue';
import DashboardFocusSections from '../features/dashboard/components/DashboardFocusSections.vue';
import DashboardFocusToggle from '../features/dashboard/components/DashboardFocusToggle.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
const { loading, loadError, consoleData, activeFocus, summary, load, openAnalysis, goBattleCard } =
  useDashboardPage();
</script>
<template>
  <section v-loading="loading" class="page-stack ops-console">
    <div class="page-toolbar">
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="load(true)">
        重新加载本地数据
      </AppleButton>
    </div>
    <ErrorAlert :message="loadError" />
    <!-- Residual #275: RECOMMEND_CACHE_CAP source undercount honesty. -->
    <p v-if="consoleData.sourceTruncated" class="list-cap-hint">
      推荐源仅加载评分前 {{ consoleData.sourceLimit }} 个在售套餐（匹配
      {{ consoleData.sourceMatchedCount }}），风险/预警看板可能不完整。
    </p>
    <!-- Residual #274 projection: RESOLVED_ALERT_DAY_LIMIT silent clip honesty. -->
    <p v-if="consoleData.resolvedIdsTruncated" class="list-cap-hint">
      今日已处理记录超过 {{ consoleData.resolvedIdsLimit }} 条上限（已加载
      {{ consoleData.resolvedIdsLoaded }} 条），部分已处理预警可能仍显示为待处理。
    </p>
    <!-- Residual #280: focus-panel Top-N honesty (KPI tiles = full candidate counts). -->
    <p v-if="consoleData.panelTruncated" class="list-cap-hint">
      焦点面板仅展示前 {{ consoleData.panelLimit ?? 8 }} 条候选，上方 KPI
      数字为完整候选数（必推/风险/爆品/滞销/社群任务）。
    </p>
    <p v-if="consoleData.alertsTruncated" class="list-cap-hint">
      预警预览仅展示前 {{ consoleData.alertsLimit ?? 30 }} 条，活跃预警总数以 KPI 为准。
    </p>
    <DashboardMetrics :summary="summary" />
    <DashboardTaskMetrics />
    <!-- Residual #213: content funnel (getDashboardSummary client existed unused). -->
    <DashboardContentFunnel />
    <DashboardFocusToggle v-model="activeFocus" />
    <DashboardFocusSections
      :active-focus="activeFocus"
      :console-data="consoleData"
      @open="openAnalysis"
      @generate="goBattleCard"
      @navigate="$router.push($event)"
    />
  </section>
</template>
<style src="../styles/views/dashboard.css" scoped></style>

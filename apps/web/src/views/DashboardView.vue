<template>
  <section v-loading="loading" class="page-stack operations-dashboard">
    <OperationsDashboardFilters
      :title="title"
      :filters="filters"
      :source-label="sourceLabel"
      :loading="loading"
      @change="updateFilters"
      @refresh="load"
    />

    <p v-if="dataNotice" class="dashboard-data-note">
      <span class="dashboard-data-note__dot" />
      {{ dataNotice }}
    </p>

    <section class="dashboard-panel dashboard-brief">
      <div class="dashboard-brief__signal">
        <div class="dashboard-brief__icon"><MagicStick /></div>
        <div>
          <div class="dashboard-section-label">01 / AI EXECUTIVE BRIEF</div>
          <h2>AI 今日经营简报</h2>
        </div>
      </div>
      <div class="dashboard-brief__content">
        <p>
          {{ briefRegion }}今日 GMV
          <strong>{{ briefGmv }}</strong>
          ，较昨日增长
          <strong>8.2%</strong>
          ，主要增长来自福田区和南山区。 但「XX 火锅双人餐」退款率达到
          <strong class="is-risk-text">12.6%</strong>
          ，较近 7 日均值上涨 63%，预计影响 GMV ¥8,200。
        </p>
        <p class="dashboard-brief__subline">
          同时科技园区域 17:00 后订单增长明显，建议今晚针对科技园用户追加晚餐套餐推广。
        </p>
      </div>
      <div class="dashboard-brief__actions">
        <button
          type="button"
          class="dashboard-button dashboard-button--quiet"
          @click="handleBriefAction('analysis')"
        >
          查看分析
          <ArrowRight />
        </button>
        <button
          type="button"
          class="dashboard-button dashboard-button--primary"
          @click="handleBriefAction('campaign')"
        >
          创建活动
          <Promotion />
        </button>
        <button
          type="button"
          class="dashboard-button dashboard-button--outline"
          @click="handleBriefAction('plan')"
        >
          生成运营方案
          <MagicStick />
        </button>
      </div>
    </section>

    <section class="dashboard-block">
      <div class="dashboard-block__heading">
        <div>
          <div class="dashboard-section-label">02 / SNAPSHOT</div>
          <h2>核心经营指标</h2>
        </div>
        <span>实时经营健康度</span>
      </div>
      <div class="dashboard-kpi-grid">
        <button
          v-for="item in data.kpis"
          :key="item.key"
          type="button"
          class="dashboard-kpi"
          :class="[`is-${item.tone}`, { 'is-risk': item.risk }]"
          @click="handleKpi(item.key)"
        >
          <span class="dashboard-kpi__topline">
            <span>{{ item.label }}</span>
            <el-icon><component :is="kpiIcons[item.icon]" /></el-icon>
          </span>
          <strong>{{ formatKpi(item) }}</strong>
          <span class="dashboard-kpi__helper" :class="{ 'is-risk-text': item.risk }">
            {{ item.helper }}
            <CaretTop v-if="!item.risk" />
            <Warning v-else />
          </span>
          <small>{{ item.secondary }}</small>
        </button>
      </div>
    </section>

    <DashboardTrendPanel
      :points="currentTrend"
      :option="trendOption"
      :metric="trendMetric"
      :time-range="filters.timeRange"
      @update:metric="trendMetric = $event"
    />

    <div class="dashboard-grid dashboard-grid--split">
      <DashboardFunnelCard :stages="data.funnel" @inspect="go('/operation/gmv')" />
      <DashboardCompositionCard
        :tab="compositionTab"
        :items="currentBreakdown"
        :total="data.kpis[0]?.value ?? 0"
        @update:tab="compositionTab = $event"
      />
    </div>

    <DashboardRankingPanels
      :merchants="data.merchants"
      :packages="currentPackages"
      :package-tab="packageTab"
      @update:package-tab="packageTab = $event"
      @open-merchants="go('/merchant-sales')"
      @open-merchant="go('/merchant-sales')"
      @open-packages="go('/packages')"
      @open-package="go('/packages')"
      @restock="restock"
    />

    <DashboardAudiencePanels
      :users="data.users"
      :community="data.community"
      @recall="createRecall"
      @open-community="go('/communities')"
    />

    <DashboardAlertsPanel
      :alerts="data.alerts"
      @open-all="go('/operation/alerts')"
      @action="handleAlertAction"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowRight,
  CaretTop,
  CircleCheck,
  Coin,
  Document,
  MagicStick,
  Promotion,
  User,
  UserFilled,
  Warning
} from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import DashboardAlertsPanel from '../features/dashboard/components/DashboardAlertsPanel.vue';
import DashboardAudiencePanels from '../features/dashboard/components/DashboardAudiencePanels.vue';
import DashboardCompositionCard from '../features/dashboard/components/DashboardCompositionCard.vue';
import DashboardFunnelCard from '../features/dashboard/components/DashboardFunnelCard.vue';
import DashboardRankingPanels from '../features/dashboard/components/DashboardRankingPanels.vue';
import DashboardTrendPanel from '../features/dashboard/components/DashboardTrendPanel.vue';
import OperationsDashboardFilters from '../features/dashboard/components/OperationsDashboardFilters.vue';
import { useOperationsDashboard } from '../features/dashboard/composables/useOperationsDashboard';
import type { DashboardKpi } from '../features/dashboard/operations-dashboard';

const router = useRouter();
const {
  filters,
  data,
  title,
  loading,
  dataNotice,
  sourceLabel,
  trendMetric,
  compositionTab,
  packageTab,
  currentTrend,
  trendOption,
  currentBreakdown,
  currentPackages,
  updateFilters,
  load,
  formatCount,
  formatMoney
} = useOperationsDashboard();

const briefRegion = computed(() =>
  filters.value.region === '全部区域' ? '全域' : filters.value.region
);
const briefGmv = computed(() => {
  const value = data.value.kpis.find((item) => item.key === 'gmv')?.value ?? 0;
  return value >= 10000 ? `¥${(value / 10000).toFixed(2)} 万` : formatMoney(value);
});

const kpiIcons: Record<DashboardKpi['icon'], unknown> = {
  coin: Coin,
  orders: Document,
  verify: CircleCheck,
  users: User,
  'new-users': UserFilled,
  refund: Warning
};

function formatKpi(item: DashboardKpi) {
  return item.format === 'currency' ? formatMoney(item.value) : formatCount(item.value);
}

function go(path: string) {
  void router.push(path);
}

function handleKpi(key: string) {
  const routes: Record<string, string> = {
    gmv: '/operation/gmv',
    orders: '/orders',
    verify: '/verifications',
    dau: '/users',
    'new-users': '/users',
    refund: '/operation/alerts'
  };
  if (routes[key]) go(routes[key]);
}

function handleBriefAction(action: 'analysis' | 'campaign' | 'plan') {
  const targets = {
    analysis: '/operation/gmv',
    campaign: '/campaigns?source=dashboard',
    plan: '/generate?source=dashboard'
  };
  go(targets[action]);
}

function createRecall() {
  void router.push({
    path: '/campaigns',
    query: {
      source: 'dashboard',
      audience: '高价值用户+14天未消费',
      users: String(data.value.users.dormantHighValue)
    }
  });
}

function restock(packageName: string) {
  void router.push({ path: '/inventory', query: { keyword: packageName, source: 'dashboard' } });
}

function handleAlertAction(id: string) {
  if (id === 'refund-rate') return go('/operation/alerts');
  if (id === 'order-drop') return go('/campaigns?source=dashboard&audience=科技园');
  if (id === 'dinner-growth') return go('/merchant-sales?source=dashboard&area=南山区');
}
</script>

<style src="../styles/views/dashboard.css" scoped></style>

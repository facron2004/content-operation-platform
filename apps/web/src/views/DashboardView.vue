<template>
  <section v-loading="loading" class="page-stack operations-dashboard">
    <OperationsDashboardFilters
      :title="title"
      :filters="filters"
      :source-label="sourceLabel"
      :loading="loading"
      @change="updateFilters"
      @refresh="refresh"
    />

    <p v-if="dataNotice" class="dashboard-data-note">
      <span class="dashboard-data-note__dot" />
      {{ dataNotice }}
    </p>

    <section class="dashboard-panel dashboard-brief">
      <div class="dashboard-brief__signal">
        <div class="dashboard-brief__icon"><MagicStick /></div>
        <div>
          <div class="dashboard-section-label">01 / EXECUTIVE BRIEF</div>
          <h2>今日经营简报</h2>
        </div>
      </div>
      <div class="dashboard-brief__content">
        <p v-if="hasBriefSnapshot">
          今日 GMV <strong>{{ briefGmv }}</strong>，支付订单
          <strong>{{ briefOrders }}</strong>，核销率
          <strong>{{ briefVerifyRate }}</strong>。
        </p>
        <p v-else>当前暂无真实经营快照，请刷新或检查当前账号的数据权限。</p>
        <p v-if="latestAlert" class="dashboard-brief__subline">
          最新预警：<strong class="is-risk-text">{{ latestAlert.title }}</strong>。{{ latestAlert.reason }}
        </p>
        <p v-else-if="data.updatedAt" class="dashboard-brief__subline">
          数据更新时间：{{ data.updatedAt }}
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
      <div v-if="data.kpis.length" class="dashboard-kpi-grid">
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
      <div v-else class="dashboard-empty">暂无真实经营指标</div>
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
        :total="gmvValue"
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
  refresh,
  formatCount,
  formatMoney
} = useOperationsDashboard();

const gmvKpi = computed(() => data.value.kpis.find((item) => item.key === 'gmv'));
const ordersKpi = computed(() => data.value.kpis.find((item) => item.key === 'orders'));
const verifyKpi = computed(() => data.value.kpis.find((item) => item.key === 'verify'));
const gmvValue = computed(() => gmvKpi.value?.value ?? 0);
const hasBriefSnapshot = computed(() => Boolean(gmvKpi.value));
const briefGmv = computed(() => {
  const value = gmvValue.value;
  return value >= 10000 ? `¥${(value / 10000).toFixed(2)} 万` : formatMoney(value);
});
const briefOrders = computed(() => formatCount(ordersKpi.value?.value ?? 0));
const briefVerifyRate = computed(() => {
  const orders = ordersKpi.value?.value ?? 0;
  const verify = verifyKpi.value?.value ?? 0;
  return orders > 0 ? `${((verify / orders) * 100).toFixed(1)}%` : '暂无数据';
});
const latestAlert = computed(() => data.value.alerts[0]);

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
    'active-users': '/users',
    'new-users': '/users',
    'dormant-users': '/users/lifecycle',
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
      audience: '用户生命周期：沉睡/流失',
      users: String(data.value.users.dormantUsers)
    }
  });
}

function restock(packageName: string) {
  void router.push({ path: '/inventory', query: { keyword: packageName, source: 'dashboard' } });
}

function handleAlertAction(id: string) {
  const alert = data.value.alerts.find((item) => item.id === id);
  if (!alert) return go('/operation/alerts');
  void router.push({
    path: '/operation/alerts',
    query: { alertId: alert.id, packageId: alert.packageId }
  });
}
</script>

<style src="../styles/views/dashboard.css" scoped></style>

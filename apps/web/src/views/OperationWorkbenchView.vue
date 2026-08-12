<script setup lang="ts">
import { computed } from 'vue';
import AppleButton from '../components/AppleButton.vue';
import ChartPanel from '../components/ChartPanel.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import MetricTile from '../components/MetricTile.vue';
import { useOperationWorkbench } from '../features/operation-workbench/useOperationWorkbench';
import { formatTime } from '../utils/labels';

const {
  loading,
  loadError,
  workbench,
  businessDate,
  trendOption,
  displayMoney,
  formatCount,
  formatPercent,
  reload,
  goPending
} = useOperationWorkbench();

const sourceLabel = computed(() => workbench.value?.dataSources.join(' · ') || '数据源加载中');
const pendingEmpty = computed(() => (workbench.value?.pending.items.length ?? 0) === 0);
</script>

<template>
  <section v-loading="loading" class="page-stack operation-workbench">
    <header class="workbench-hero panel">
      <div>
        <p class="eyebrow">{{ workbench?.date || businessDate }} / V2.0.1 基础统一</p>
        <h1>经营工作台</h1>
        <p class="hero-description">
          从经营结果到异常待办，统一查看今日业务状态，并进入对应中心继续处理。
        </p>
      </div>
      <div class="workbench-hero__actions">
        <label class="date-control">
          <span>业务日</span>
          <el-date-picker
            v-model="businessDate"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
            style="width: 150px"
            @change="reload"
          />
        </label>
        <span class="source-pill">{{ sourceLabel }}</span>
        <span class="updated-at">更新 {{ formatTime(workbench?.updatedAt) }}</span>
        <AppleButton variant="secondary" size="sm" :loading="loading" @click="reload">
          刷新
        </AppleButton>
      </div>
    </header>

    <ErrorAlert :message="loadError" />

    <div class="workbench-kpis">
      <MetricTile label="今日 GMV" :value="displayMoney(workbench?.kpis.gmv, 'totalGmv')" info />
      <MetricTile label="支付订单" :value="formatCount(workbench?.kpis.gmv.paidOrderCount)" />
      <MetricTile label="核销金额" :value="displayMoney(workbench?.kpis.gmv, 'totalVerify')" />
      <MetricTile label="退款金额" :value="displayMoney(workbench?.kpis.gmv, 'totalRefund')" />
      <MetricTile label="活跃商家" :value="formatCount(workbench?.kpis.catalog.totalMerchants)" />
      <MetricTile
        label="30 天未动销 SKU"
        :value="formatCount(workbench?.kpis.catalog.zeroSalesSkuCount)"
        :danger="(workbench?.kpis.catalog.zeroSalesSkuCount ?? 0) > 0"
      />
    </div>

    <div class="workbench-main-grid">
      <section class="panel workbench-chart-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">经营趋势</p>
            <h2>近 7 日 GMV 与支付订单</h2>
          </div>
          <span class="section-meta">强制使用统一支付口径</span>
        </div>
        <ChartPanel :option="trendOption" />
        <p v-if="!workbench?.trend.length" class="empty-hint">当前业务日暂无趋势数据</p>
      </section>

      <section class="panel workbench-pending-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">行动中心</p>
            <h2>今日待处理事项</h2>
          </div>
          <span class="pending-total">{{ formatCount(workbench?.pending.total) }}</span>
        </div>
        <div v-if="pendingEmpty" class="pending-empty">当前没有待处理事项</div>
        <button
          v-for="item in workbench?.pending.items"
          :key="item.key"
          type="button"
          class="pending-row"
          :class="`pending-row--${item.tone}`"
          @click="goPending(item)"
        >
          <span class="pending-row__copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <span class="pending-row__count">{{ formatCount(item.count) }}</span>
          <span class="pending-row__arrow">›</span>
        </button>
      </section>
    </div>

    <div class="workbench-secondary-grid">
      <section class="panel catalog-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">基础盘子</p>
            <h2>商品与商家概览</h2>
          </div>
          <span class="section-meta">{{ workbench?.kpis.catalog.dataSource || '—' }}</span>
        </div>
        <dl class="catalog-stats">
          <div>
            <dt>商品 SKU</dt>
            <dd>{{ formatCount(workbench?.kpis.catalog.totalSkus) }}</dd>
          </div>
          <div>
            <dt>零动销商家</dt>
            <dd>{{ formatCount(workbench?.kpis.catalog.zeroSalesMerchants) }}</dd>
          </div>
          <div>
            <dt>零动销占比</dt>
            <dd>{{ formatPercent(workbench?.kpis.catalog.zeroSalesSkuRatio) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel quick-links-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">继续下钻</p>
            <h2>常用经营入口</h2>
          </div>
        </div>
        <div class="quick-links">
          <router-link to="/gmv-cockpit">
            GMV 分析
            <span>›</span>
          </router-link>
          <router-link to="/merchant-sales">
            商家经营
            <span>›</span>
          </router-link>
          <router-link to="/zero-sales">
            库存预警
            <span>›</span>
          </router-link>
          <router-link to="/audit-logs">
            操作审计
            <span>›</span>
          </router-link>
        </div>
      </section>
    </div>
  </section>
</template>

<style src="../styles/views/operation-workbench.css" scoped></style>

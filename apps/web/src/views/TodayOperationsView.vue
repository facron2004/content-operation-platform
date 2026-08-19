<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, CircleCheck, DataLine, Refresh, Warning } from '@element-plus/icons-vue';
import AppleButton from '../components/AppleButton.vue';
import ChartPanel from '../components/ChartPanel.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useOperationWorkbench } from '../features/operation-workbench/useOperationWorkbench';

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

const pendingItems = computed(() => {
  const items = workbench.value?.pending.items ?? [];
  const priority: Record<string, number> = { danger: 0, warning: 1, info: 2 };
  return [...items].sort((a, b) => priority[a.tone] - priority[b.tone]);
});

const pendingTotal = computed(() => workbench.value?.pending.total ?? 0);
const dangerTotal = computed(() =>
  pendingItems.value
    .filter((item) => item.tone === 'danger')
    .reduce((total, item) => total + item.count, 0)
);
const warningTotal = computed(() =>
  pendingItems.value
    .filter((item) => item.tone === 'warning')
    .reduce((total, item) => total + item.count, 0)
);
const gmv = computed(() => workbench.value?.kpis.gmv);
const catalog = computed(() => workbench.value?.kpis.catalog);
const operationalState = computed(() => {
  if (dangerTotal.value > 0) return '需要立即处理';
  if (warningTotal.value > 0) return '有风险待跟进';
  if (pendingTotal.value > 0) return '有事项待处理';
  return '运行平稳';
});
const updatedLabel = computed(() => {
  const updatedAt = workbench.value?.updatedAt;
  if (!updatedAt) return '等待数据更新';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return `更新于 ${updatedAt}`;
  return `更新于 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
});
const dataSourceLabel = computed(() => workbench.value?.dataSources.join(' / ') || '本地经营数据');

function dateLabel(value: string) {
  if (!value) return '今日';
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}月${Number(day)}日` : value;
}
</script>

<template>
  <section v-loading="loading" class="page-stack today-operations">
    <header class="today-ops-hero">
      <div class="today-ops-hero__grid" aria-hidden="true" />
      <div class="today-ops-hero__topline">
        <div>
          <p class="today-ops-kicker">TODAY / OPERATIONS CONTROL</p>
          <h1>运营值班台</h1>
          <p class="today-ops-lede">先处理会影响今天结果的事项，再回看经营脉搏。</p>
        </div>
        <div class="today-ops-controls">
          <label class="today-ops-date">
            <span>业务日</span>
            <el-date-picker
              v-model="businessDate"
              type="date"
              value-format="YYYY-MM-DD"
              :clearable="false"
              style="width: 132px"
              @change="reload"
            />
          </label>
          <AppleButton variant="tinted" size="sm" :loading="loading" @click="reload">
            <template #icon><Refresh /></template>
            刷新数据
          </AppleButton>
        </div>
      </div>

      <div class="today-ops-status-row">
        <div class="today-ops-status today-ops-status--primary">
          <span class="today-ops-status__icon"><DataLine /></span>
          <span>
            <small>当前状态</small>
            <strong>{{ operationalState }}</strong>
          </span>
        </div>
        <div class="today-ops-status">
          <small>待处理事项</small>
          <strong>{{ formatCount(pendingTotal) }}</strong>
          <span>项</span>
        </div>
        <div class="today-ops-status today-ops-status--danger">
          <small>高风险</small>
          <strong>{{ formatCount(dangerTotal) }}</strong>
          <span>项</span>
        </div>
        <div class="today-ops-status today-ops-status--soft">
          <small>{{ dateLabel(businessDate) }} · 数据源</small>
          <strong>{{ updatedLabel }}</strong>
          <span>{{ dataSourceLabel }}</span>
        </div>
      </div>
    </header>

    <ErrorAlert :message="loadError" />

    <div class="today-ops-main-grid">
      <section class="today-ops-panel today-ops-queue">
        <div class="today-ops-panel__heading">
          <div>
            <p class="today-ops-eyebrow">01 / DO NEXT</p>
            <h2>现在该处理什么</h2>
            <p>按风险优先级排列，点击一项直接进入处理页面。</p>
          </div>
          <span class="today-ops-count-badge">{{ formatCount(pendingTotal) }} 项</span>
        </div>

        <div v-if="pendingItems.length" class="today-ops-queue__list">
          <button
            v-for="item in pendingItems"
            :key="item.key"
            type="button"
            class="today-ops-queue__item"
            :class="`is-${item.tone}`"
            @click="goPending(item)"
          >
            <span class="today-ops-queue__marker">
              <Warning v-if="item.tone === 'danger'" />
              <CircleCheck v-else />
            </span>
            <span class="today-ops-queue__copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <span class="today-ops-queue__number">{{ formatCount(item.count) }}</span>
            <ArrowRight class="today-ops-queue__arrow" />
          </button>
        </div>
        <div v-else class="today-ops-empty">
          <CircleCheck />
          <strong>今天没有待处理事项</strong>
          <span>运营队列已经清空，可以继续观察经营脉搏。</span>
        </div>

        <div class="today-ops-panel__footer">
          <span>队列来自活动、触达任务、后台任务和库存数据</span>
          <router-link to="/tasks">查看任务中心 <ArrowRight /></router-link>
        </div>
      </section>

      <section class="today-ops-panel today-ops-pulse">
        <div class="today-ops-panel__heading">
          <div>
            <p class="today-ops-eyebrow">02 / PULSE</p>
            <h2>经营脉搏</h2>
            <p>只保留判断今天动作所需的结果信号。</p>
          </div>
          <span class="today-ops-source">近 7 日</span>
        </div>
        <ChartPanel :option="trendOption" />
        <div class="today-ops-metrics">
          <div>
            <small>经营日净 GMV</small>
            <strong>{{ displayMoney(gmv, 'totalGmv') }}</strong>
          </div>
          <div>
            <small>支付订单</small>
            <strong>{{ formatCount(gmv?.paidOrderCount ?? 0) }}</strong>
          </div>
          <div>
            <small>核销率</small>
            <strong>{{ formatPercent(gmv?.verifyRate ?? 0) }}</strong>
          </div>
          <div>
            <small>退款率</small>
            <strong class="is-alert-value">{{ formatPercent(gmv?.refundRate ?? 0) }}</strong>
          </div>
        </div>
      </section>
    </div>

    <div class="today-ops-secondary-grid">
      <section class="today-ops-panel today-ops-risk-radar">
        <div class="today-ops-panel__heading">
          <div>
            <p class="today-ops-eyebrow">03 / RISK RADAR</p>
            <h2>商品与商家风险</h2>
            <p>把需要运营介入的盘子单独拎出来。</p>
          </div>
          <router-link class="today-ops-link" to="/zero-sales">查看库存风险 <ArrowRight /></router-link>
        </div>
        <div class="today-ops-risk-grid">
          <div class="today-ops-risk-card is-danger">
            <small>30 天未动销 SKU</small>
            <strong>{{ formatCount(catalog?.zeroSalesSkuCount ?? 0) }}</strong>
            <span>需要重新评估供给</span>
          </div>
          <div class="today-ops-risk-card">
            <small>零动销商家</small>
            <strong>{{ formatCount(catalog?.zeroSalesMerchants ?? 0) }}</strong>
            <span>建议查看商家经营</span>
          </div>
          <div class="today-ops-risk-card">
            <small>零动销 SKU 占比</small>
            <strong>{{ formatPercent(catalog?.zeroSalesSkuRatio ?? 0) }}</strong>
            <span>数据源：{{ catalog?.dataSource || '—' }}</span>
          </div>
        </div>
      </section>

      <section class="today-ops-panel today-ops-actions">
        <div class="today-ops-panel__heading">
          <div>
            <p class="today-ops-eyebrow">04 / QUICK ACTIONS</p>
            <h2>快速动作</h2>
            <p>从今天的判断直接进入下一步。</p>
          </div>
        </div>
        <div class="today-ops-actions__list">
          <router-link to="/operation/gmv">
            <span><strong>看经营结果</strong><small>确认 GMV 与支付结构</small></span>
            <ArrowRight />
          </router-link>
          <router-link to="/operation/alerts">
            <span><strong>看经营预警</strong><small>定位异常对象和处理动作</small></span>
            <ArrowRight />
          </router-link>
          <router-link to="/campaigns">
            <span><strong>创建运营动作</strong><small>活动、触达和内容继续执行</small></span>
            <ArrowRight />
          </router-link>
        </div>
      </section>
    </div>
  </section>
</template>

<style src="../styles/views/today-operations.css" scoped></style>

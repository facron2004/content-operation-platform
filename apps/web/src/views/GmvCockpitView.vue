<template>
  <section v-loading="loading" class="page-stack cockpit">
    <header class="cockpit-hero panel">
      <div>
        <p class="eyebrow">{{ kpi?.date || todayText }} / 数据中台 GMV 看板</p>
        <h2>GMV 看板</h2>
        <p class="hero-description">
          一屏看清任意日期的 GMV、退款率、核销率与活跃商家; 点击任一卡片可下钻到 GMV
          趋势、商家排行或退款分析。
        </p>
      </div>
      <div class="hero-meta">
        <div class="hero-controls">
          <span class="control-label">KPI 日期</span>
          <el-date-picker
            v-model="kpiDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            :disabled-date="disableFutureDate"
            @change="onKpiDateChange"
          />
        </div>
        <el-tag size="small" effect="plain" type="info">
          {{ kpi?.dataSource || '加载中' }}
        </el-tag>
        <span class="updated-at">更新 {{ formatTime(kpi?.updatedAt) }}</span>
        <el-dropdown trigger="click" @command="onBackfillCommand">
          <el-button size="small" :loading="backfilling" data-testid="gmv-backfill">
            {{ backfillLabel }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="1">重抓最近 1 天</el-dropdown-item>
              <el-dropdown-item :command="3">重抓最近 3 天</el-dropdown-item>
              <el-dropdown-item :command="7">重抓最近 7 天</el-dropdown-item>
              <el-dropdown-item :command="14">重抓最近 14 天</el-dropdown-item>
              <el-dropdown-item :command="30">重抓最近 30 天</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" :loading="loading" data-testid="gmv-reload" @click="reload">
          刷新
        </el-button>
      </div>
    </header>

    <ErrorAlert :message="loadError" />

    <!-- 4 块核心 KPI -->
    <div class="kpi-row">
      <MetricTile :label="kpiDateLabel" :value="formatGmv(kpi?.totalGmv)" info />
      <MetricTile
        label="退款率"
        :value="formatPercent(kpi?.refundRate)"
        :danger="(kpi?.refundRate ?? 0) >= 0.05"
      />
      <MetricTile
        label="核销率"
        :value="formatPercent(kpi?.verifyRate)"
        :danger="(kpi?.verifyRate ?? 0) <= 0.6 && (kpi?.verifyRate ?? 0) > 0"
      />
      <MetricTile label="净 GMV" :value="formatGmv(netGmv)" />
    </div>

    <!-- GMV 公式披露 -->
    <section class="panel breakdown">
      <header class="breakdown-head">
        <h3>GMV 构成（披露口径）</h3>
        <p class="muted">
          ¥ {{ formatNumber(totalGmvDisplay) }} = 在线现金 + 余额支付（积分抵现不计入 GMV）
        </p>
      </header>
      <div class="breakdown-bars">
        <div class="breakdown-bar" :style="{ width: barGmvOnline + '%' }">
          <span class="bar-label">在线 {{ formatPercentRaw(barGmvOnline) }}</span>
          <span class="bar-value">¥ {{ formatNumber(kpi?.gmvOnline) }}</span>
        </div>
        <div class="breakdown-bar bar-wallet" :style="{ width: barGmvWallet + '%' }">
          <span class="bar-label">余额 {{ formatPercentRaw(barGmvWallet) }}</span>
          <span class="bar-value">¥ {{ formatNumber(kpi?.gmvWallet) }}</span>
        </div>
      </div>
      <p class="muted small">
        积分抵现 ¥ {{ formatNumber(kpi?.gmvBonus ?? 0) }}（支付方式,不计入 GMV）； 储值卡 ¥
        {{ formatNumber(kpi?.gmvCard ?? 0) }}
      </p>
    </section>

    <!-- 趋势 + 维度分布 -->
    <div class="chart-row">
      <section class="panel chart-card">
        <header>
          <h3>近期 GMV 趋势</h3>
          <el-radio-group v-model="trendDays" size="small" @change="loadTrend">
            <el-radio-button :value="7">7 日</el-radio-button>
            <el-radio-button :value="30">30 日</el-radio-button>
          </el-radio-group>
        </header>
        <ChartPanel :option="trendOption" />
      </section>
      <section class="panel chart-card">
        <header>
          <h3>GMV 区域分布</h3>
          <el-radio-group v-model="distDim" size="small" @change="loadDistribution">
            <el-radio-button value="area">区域</el-radio-button>
            <el-radio-button value="category">品类</el-radio-button>
          </el-radio-group>
        </header>
        <ChartPanel :option="distributionOption" />
      </section>
    </div>

    <!-- Top 商家榜 -->
    <section class="panel top-offenders">
      <header>
        <h3>Top 商家 GMV</h3>
        <el-radio-group v-model="merchantSort" size="small" @change="loadTopMerchants">
          <el-radio-button value="gmvDesc">按 GMV</el-radio-button>
          <el-radio-button value="refundDesc">按 退款</el-radio-button>
          <el-radio-button value="verifyDesc">按 核销</el-radio-button>
        </el-radio-group>
      </header>
      <el-table :data="topMerchants" size="small" empty-text="暂无数据">
        <el-table-column prop="merchantName" label="商家" min-width="220" show-overflow-tooltip />
        <el-table-column prop="areaName" label="区域" min-width="100">
          <template #default="{ row }">{{ row.areaName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="gmv" label="GMV" min-width="120" align="right">
          <template #default="{ row }">¥ {{ formatNumber(row.gmv) }}</template>
        </el-table-column>
        <el-table-column prop="gmvRefund" label="退款金额" min-width="100" align="right">
          <template #default="{ row }">¥ {{ formatNumber(row.gmvRefund) }}</template>
        </el-table-column>
        <el-table-column label="退款率" min-width="80" align="right">
          <template #default="{ row }">{{ formatPercent(row.refundRate) }}</template>
        </el-table-column>
        <el-table-column prop="paidOrderCount" label="成单数" min-width="80" align="right" />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import MetricTile from '../components/MetricTile.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  getGmvByMerchant,
  getGmvDistribution,
  getGmvToday,
  getGmvTrend,
  refreshGmvFromJeesite,
  type GmvKpi,
  type GmvMerchantRow,
  type GmvTrendPoint
} from '../services/api/gmv.api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import { formatTime } from '../utils/labels';
import { extractErrorMessage } from '../services/http-client';

const ChartPanel = defineAsyncComponent(() => import('../components/ChartPanel.vue'));

const loading = ref(false);
const loadError = ref<string | null>(null);

const kpi = ref<GmvKpi | null>(null);
const trend = ref<GmvTrendPoint[]>([]);
const distribution = ref<
  Array<{
    key: string;
    totalGmv: number;
    gmvOnline: number;
    gmvWallet: number;
    gmvBonus: number;
    share: number;
  }>
>([]);
const topMerchants = ref<GmvMerchantRow[]>([]);

const trendDays = ref<7 | 30>(7);
const distDim = ref<'area' | 'category'>('area');
const merchantSort = ref<'gmvDesc' | 'refundDesc' | 'verifyDesc'>('gmvDesc');
const todayText = new Date().toISOString().slice(0, 10);
const kpiDate = ref<string>(todayText); // 当前 KPI 展示的日期
const backfilling = ref(false);
const backfillLabel = computed(() => (backfilling.value ? '抓取中...' : '历史回填'));

/** 日期选择器:禁止选今天之后的日期(ETL 当日数据要在 0 点后才完整)。 */
function disableFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

/** 把"今天 / N 天前"翻译成人话标签 */
const kpiDateLabel = computed(() => {
  if (kpiDate.value === todayText) return '今日 GMV';
  return `${kpiDate.value} GMV`;
});

async function loadKpis() {
  try {
    kpi.value = await getGmvToday(kpiDate.value, true);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载 KPI 失败');
  }
}

async function loadTrend() {
  try {
    trend.value = await getGmvTrend(trendDays.value, kpiDate.value, true);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadDistribution() {
  try {
    distribution.value = await getGmvDistribution(distDim.value, 10, true);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

async function loadTopMerchants() {
  try {
    const result = await getGmvByMerchant(merchantSort.value, 1, 20, true);
    topMerchants.value = result.items;
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载商家榜失败');
  }
}

/** 切换 KPI 日期时:同步重载 KPI + 趋势端点(趋势 endDate 受控)。 */
async function onKpiDateChange() {
  await Promise.all([loadKpis(), loadTrend()]);
}

/** 计算给定日期向前 N 天的 YYYY-MM-DD(UTC 基准) */
function shiftDate(yyyyMmDd: string, days: number): string {
  const t = Date.parse(`${yyyyMmDd}T00:00:00Z`);
  if (!Number.isFinite(t)) return yyyyMmDd;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** 下拉菜单触发:重抓最近 N 天的订单。最大 30 页/日 = 1500 单/日,周期长会等一会儿。
 *  完成后强制刷新所有视图,趋势端点会用最新 local 数据重算。 */
async function onBackfillCommand(days: number) {
  const endDate = todayText;
  const startDate = shiftDate(endDate, -(days - 1));
  let confirmed = false;
  try {
    await ElMessageBox.confirm(
      `将重抓 ${startDate} → ${endDate} (${days} 天) 的订单到本地,并刷新所有 GMV 视图。继续?`,
      '历史回填',
      { type: 'info', confirmButtonText: '开始回填', cancelButtonText: '取消' }
    );
    confirmed = true;
  } catch {
    confirmed = false;
  }
  if (!confirmed) return;
  backfilling.value = true;
  loadError.value = null;
  const start = Date.now();
  try {
    const etlResult = await refreshGmvFromJeesite(startDate, endDate);
    ElMessage.success(
      `回填完成: ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页) — ${startDate} → ${endDate}`
    );
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, '回填失败'));
  } finally {
    backfilling.value = false;
  }
  console.info(`[GMV] backfill ${days}d done in ${Date.now() - start}ms`);
  await reload();
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  console.info('[GMV] reload start', new Date().toISOString());
  const start = Date.now();
  // 1) ETL:今天的数据补一次
  try {
    const etlResult = await refreshGmvFromJeesite();
    console.info('[GMV] ETL result', etlResult);
    ElMessage.success(`已拉取 ${etlResult.upserted} 单 (${etlResult.pagesFetched} 页)`);
  } catch (err) {
    console.warn('[GMV] ETL failed,继续重算:', err);
    ElMessage.warning('拉取 JeSite 失败,使用本地数据');
  }
  // 2) 刷新当前选中日期的 KPI + 趋势(以当前日期为 endDate 算起)
  await Promise.all([loadKpis(), loadTrend(), loadDistribution(), loadTopMerchants()]);
  console.info(
    `[GMV] reload done in ${Date.now() - start}ms, kpi.updatedAt=${kpi.value?.updatedAt ?? 'n/a'}`
  );
  loading.value = false;
}

onMounted(reload);

// ===== 计算属性 =====

const netGmv = computed(() => {
  if (!kpi.value) return 0;
  return kpi.value.totalGmv - kpi.value.totalRefund;
});

const totalGmvDisplay = computed(() => kpi.value?.totalGmv ?? 0);

const barGmvOnline = computed(() => {
  if (!kpi.value || kpi.value.totalGmv === 0) return 0;
  return (kpi.value.gmvOnline / kpi.value.totalGmv) * 100;
});
const barGmvWallet = computed(() => {
  if (!kpi.value || kpi.value.totalGmv === 0) return 0;
  return (kpi.value.gmvWallet / kpi.value.totalGmv) * 100;
});

// ===== ECharts options =====

const trendOption = computed(() => {
  if (trend.value.length === 0) return {};
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 60, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.value.map((p) => p.date.slice(5)),
      axisLabel: { fontSize: 11 }
    },
    yAxis: [
      { type: 'value', name: 'GMV', position: 'left' },
      { type: 'value', name: '成单数', position: 'right' }
    ],
    series: [
      {
        name: 'GMV',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: trend.value.map((p) => Number(p.totalGmv.toFixed(2))),
        itemStyle: { color: '#2563eb' },
        areaStyle: { color: 'rgba(37, 99, 235, 0.08)' }
      },
      {
        name: '成单数',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.value.map((p) => p.paidOrderCount),
        itemStyle: { color: '#f97316' }
      }
    ]
  };
});

const distributionOption = computed(() => {
  if (distribution.value.length === 0) return {};
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 30, top: 20, bottom: 60 },
    xAxis: {
      type: 'category',
      data: distribution.value.map((r) => r.key),
      axisLabel: { rotate: 30, fontSize: 11 }
    },
    yAxis: { type: 'value', name: 'GMV' },
    series: [
      {
        type: 'bar',
        data: distribution.value.map((r) => ({
          value: Number(r.totalGmv.toFixed(2)),
          itemStyle: { color: '#2563eb' }
        })),
        barMaxWidth: 32
      }
    ]
  };
});

// ===== 格式化 =====

function formatGmv(value?: number): string {
  if (value == null) return '—';
  return `¥ ${formatNumber(value)}`;
}

function formatNumber(value: number | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatPercent(value?: number): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

/** 已经是 0-100 的百分比(不是 0-1 小数),不要再乘 100。用于 barGmvOnline/BarGmvWallet。 */
function formatPercentRaw(value?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
}
</script>

<style scoped>
.cockpit {
  gap: 12px;
}

.cockpit-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  box-shadow: var(--shadow-soft);
}

.cockpit-hero h2 {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.hero-description {
  max-width: 62ch;
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.control-label {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.breakdown {
  padding: 16px 20px;
}

.breakdown-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.breakdown-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

.breakdown-bars {
  display: flex;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--panel);
}

.breakdown-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  background: #2563eb;
}

.breakdown-bar + .breakdown-bar {
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}

.breakdown-bar.bar-wallet {
  background: #f97316;
}

.breakdown-bar.bar-bonus {
  background: #10b981;
}

.bar-label {
  font-weight: 700;
}

.chart-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
}

.chart-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chart-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

.chart-card :deep(.chart-shell) {
  min-height: 280px;
}

.top-offenders {
  padding: 14px 16px;
}

.top-offenders header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.top-offenders h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

@media (max-width: 1280px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .chart-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .kpi-row {
    grid-template-columns: 1fr;
  }
  .cockpit-hero {
    flex-direction: column;
  }
  .hero-meta {
    align-self: flex-start;
  }
}
</style>

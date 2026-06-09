<template>
  <section v-loading="loading" class="page-stack ops-console">
    <section class="ops-hero">
      <div>
        <p class="eyebrow">{{ consoleData.date || todayText }} / 本地生活运营作战中台</p>
        <h2>今日要推什么、拦什么、补什么，一屏看清</h2>
        <p>系统基于 JeeSite 销售中套餐、每日库存快照、核销和退款表现生成今日动作，不依赖 mock 数据。</p>
        <div class="ops-source-row">
          <el-tag effect="plain">{{ summary.dataSource ?? 'JeeSite' }} 实时数据</el-tag>
          <el-tag type="success" effect="plain">仅销售中</el-tag>
          <span>更新时间 {{ formatTime(summary.updatedAt) }}</span>
          <span>平均评分 {{ summary.avgScore ?? 0 }}</span>
          <span>待处理预警 {{ summary.activeAlertCount ?? 0 }}</span>
          <span>今日已处理 {{ summary.resolvedAlertCount ?? 0 }}</span>
        </div>
      </div>
      <el-button type="primary" :loading="loading" @click="load(true)">刷新作战台</el-button>
    </section>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon closable style="margin-bottom: 12px" />

    <div class="ops-focus-bar">
      <el-segmented v-model="activeFocus" :options="focusOptions" />
      <div class="ops-alert-pills">
        <span class="danger-pill">高危 {{ summary.dangerAlertCount ?? 0 }}</span>
        <span>警告 {{ summary.warningAlertCount ?? 0 }}</span>
      </div>
    </div>

    <div class="metric-strip ops-metrics">
      <MetricTile label="销售中套餐" :value="summary.sellingCount ?? 0" />
      <MetricTile label="今日必推" :value="summary.mustPushCount ?? 0" />
      <MetricTile label="风险套餐" :value="summary.riskCount ?? 0" danger />
      <MetricTile label="爆品机会" :value="summary.hotOpportunityCount ?? 0" />
      <MetricTile label="连续滞销" :value="summary.slowMovingCount ?? 0" danger />
      <MetricTile label="社群任务" :value="summary.communityTaskCount ?? 0" />
    </div>

    <div v-if="activeFocus === 'all' || activeFocus === 'push' || activeFocus === 'risk'" class="ops-grid">
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'push'"
        title="今日必推套餐"
        empty-text="暂无必推套餐"
        :items="consoleData.mustPushPackages ?? []"
        @open="openAnalysis"
        @generate="goBattleCard"
      />
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'risk'"
        title="今日风险套餐"
        empty-text="暂无风险套餐"
        :items="consoleData.riskPackages ?? []"
        danger
        @open="openAnalysis"
        @generate="goBattleCard"
      />
    </div>

    <div v-if="activeFocus === 'all' || activeFocus === 'hot' || activeFocus === 'slow'" class="ops-grid">
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'hot'"
        title="今日爆品机会"
        empty-text="暂无爆品机会"
        :items="consoleData.hotOpportunities ?? []"
        @open="openAnalysis"
        @generate="goBattleCard"
      />
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'slow'"
        title="今日滞销套餐"
        empty-text="暂无滞销套餐"
        :items="consoleData.slowMovingPackages ?? []"
        danger
        @open="openAnalysis"
        @generate="goBattleCard"
      />
    </div>

    <div v-if="activeFocus === 'all' || activeFocus === 'community' || activeFocus === 'review'" class="ops-grid">
      <section v-if="activeFocus === 'all' || activeFocus === 'community'" class="panel">
        <div class="panel-head">
          <h2>今日社群推送任务</h2>
          <el-button text type="primary" @click="$router.push('/communities')">社群运营</el-button>
        </div>
        <div v-if="(consoleData.communityTasks ?? []).length" class="task-list">
          <article v-for="task in consoleData.communityTasks" :key="task.taskId" class="task-row">
            <div>
              <strong>{{ task.groupName }}</strong>
              <span>{{ task.plannedTime }} / {{ channelLabels[task.channel] }}</span>
              <p>{{ task.reason }}</p>
            </div>
            <el-button size="small" @click="goBattleCard(task.packageId)">作战卡</el-button>
          </article>
        </div>
        <EmptyState v-else icon="群" title="暂无社群任务" description="待有匹配套餐后生成社群推送任务" />
      </section>

      <section v-if="activeFocus === 'all' || activeFocus === 'review'" class="panel">
        <div class="panel-head">
          <h2>昨日运营复盘</h2>
          <el-button text type="primary" @click="$router.push('/performance')">效果看板</el-button>
        </div>
        <div class="review-list">
          <p v-for="item in consoleData.yesterdayReview?.whatHappened ?? []" :key="item">{{ item }}</p>
        </div>
        <div class="suggestion-list">
          <strong>明日建议</strong>
          <span v-for="item in consoleData.yesterdayReview?.tomorrowSuggestions ?? []" :key="item">{{ item }}</span>
        </div>
      </section>
    </div>

    <section v-if="activeFocus === 'all' || activeFocus === 'risk'" class="panel">
      <div class="panel-head">
        <h2>异常预警速览</h2>
        <el-button text type="primary" @click="$router.push('/alerts')">查看全部</el-button>
      </div>
      <el-table :data="consoleData.alerts ?? []" height="280" empty-text="暂无预警">
        <el-table-column prop="title" label="预警" width="120" />
        <el-table-column prop="packageName" label="套餐" min-width="180" show-overflow-tooltip />
        <el-table-column prop="areaName" label="区域" width="90" />
        <el-table-column label="等级" width="76">
          <template #default="{ row }">
            <el-tag :type="alertTagType(row.level)" effect="dark">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
        <el-table-column prop="action" label="下一步动作" min-width="200" show-overflow-tooltip />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { OperationCard, OperationAlert } from '@content/shared';
import EmptyState from '../components/EmptyState.vue';
import MetricTile from '../components/MetricTile.vue';
import OperationSection from '../components/OperationSection.vue';
import { api, type ConsoleResponse } from '../services/api';
import { useRoleStore } from '../stores/role';
import { channelLabels, riskTagType, alertTagType, formatTime } from '../utils/labels';
import { usePackageNavigation } from '../utils/navigation';

interface ConsoleSummary {
  sellingCount: number;
  mustPushCount: number;
  riskCount: number;
  hotOpportunityCount: number;
  slowMovingCount: number;
  communityTaskCount: number;
  avgScore: number;
  dangerAlertCount: number;
  warningAlertCount: number;
  activeAlertCount: number;
  resolvedAlertCount: number;
  updatedAt: string;
  dataSource: string;
  sellingOnly: boolean;
}

interface CommunityTask {
  taskId: string;
  groupName: string;
  plannedTime: string;
  channel: string;
  packageId: string;
  reason: string;
}

interface OperationConsoleData {
  date: string;
  summary: ConsoleSummary;
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityTask[];
  yesterdayReview: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] };
  alerts: OperationAlert[];
}

const router = useRouter();
const roleStore = useRoleStore();
const loading = ref(false);
const loadError = ref<string | null>(null);
const emptyConsoleData: OperationConsoleData = {
  date: '',
  summary: { sellingCount: 0, mustPushCount: 0, riskCount: 0, hotOpportunityCount: 0, slowMovingCount: 0, communityTaskCount: 0, avgScore: 0, dangerAlertCount: 0, warningAlertCount: 0, activeAlertCount: 0, resolvedAlertCount: 0, updatedAt: '', dataSource: 'JeeSite', sellingOnly: true },
  mustPushPackages: [], riskPackages: [], hotOpportunities: [], slowMovingPackages: [],
  communityTasks: [], yesterdayReview: { date: '', whatHappened: [], tomorrowSuggestions: [] }, alerts: []
};
const consoleData = ref<OperationConsoleData>(emptyConsoleData);
const activeFocus = ref('all');
const todayText = new Date().toISOString().slice(0, 10);
const summary = computed(() => consoleData.value?.summary ?? {} as Partial<ConsoleSummary>);
const focusOptions = [
  { label: '全局', value: 'all' },
  { label: '必推', value: 'push' },
  { label: '风险', value: 'risk' },
  { label: '爆品', value: 'hot' },
  { label: '滞销', value: 'slow' },
  { label: '社群', value: 'community' },
  { label: '复盘', value: 'review' }
];

// 使用 utils/labels.ts 中的共享格式化函数：
// formatTime, riskTagType, alertTagType

const { goBattleCard, goAnalysis: openAnalysis } = usePackageNavigation(router);

const load = async (force = false) => {
  loading.value = true;
  loadError.value = null;
  try {
    if (force) api.clearCache();
    consoleData.value = await api.getTodayOperationConsole({ role: roleStore.currentRole }) as unknown as OperationConsoleData;
  } catch (e: unknown) {
    loadError.value = '作战台数据加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

onMounted(load);

// 角色切换后自动刷新作战台数据
watch(() => roleStore.currentRole, () => load(true));

// 60 秒自动刷新作战台数据（页面不可见时暂停，节省请求）
const AUTO_REFRESH_INTERVAL = 60_000;
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

const startAutoRefresh = () => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (!document.hidden) load();
  }, AUTO_REFRESH_INTERVAL);
};

const onVisibilityChange = () => {
  if (document.hidden) {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  } else {
    load(); // 切回页面时立即刷新
    startAutoRefresh();
  }
};

onMounted(() => {
  startAutoRefresh();
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.ops-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.ops-hero h2 {
  margin: 0;
  font-size: 26px;
}

.ops-hero p:not(.eyebrow) {
  margin: 8px 0 0;
  color: var(--muted);
}

.ops-source-row,
.ops-focus-bar,
.ops-alert-pills,
.ops-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.ops-source-row {
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}

.ops-focus-bar {
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.ops-alert-pills span {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--muted);
  font-size: 12px;
}

.ops-alert-pills .danger-pill {
  background: var(--danger-soft);
  color: var(--danger);
}

.ops-metrics {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.ops-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.ops-grid > .panel:only-child {
  grid-column: 1 / -1;
}

.ops-card-list,
.task-list,
.review-list,
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ops-card,
.task-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.ops-card {
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.ops-card:hover {
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: var(--shadow-soft);
  transform: translateY(-1px);
}

.ops-card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ops-card-meta {
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
}

.ops-card-meta span {
  padding: 4px 8px;
  border-radius: 8px;
  background: #f4f7fb;
}

.ops-card strong {
  color: var(--ink);
  line-height: 1.4;
}

.ops-card p,
.task-row p {
  margin: 8px 0;
  color: var(--muted);
  line-height: 1.5;
}

.ops-card small,
.task-row span {
  color: var(--muted);
}

.compact {
  gap: 6px;
}

.review-list p,
.suggestion-list span {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  color: var(--ink);
}

.suggestion-list strong {
  margin-top: 4px;
}
</style>

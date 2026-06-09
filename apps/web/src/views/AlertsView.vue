<template>
  <section v-loading="loading" class="page-stack alerts-page">
    <section class="alerts-hero">
      <div>
        <p class="eyebrow">Risk Control Desk</p>
        <h2>异常预警中心</h2>
        <p>只展示今日未处理预警。处理后会写入本地状态，刷新页面不会再回到待办里。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="load(true)">刷新预警</el-button>
    </section>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon closable style="margin-bottom: 12px" />

    <div class="metric-strip alert-metrics">
      <MetricTile label="待处理" :value="summary.activeCount" danger />
      <MetricTile label="高危" :value="summary.dangerCount" danger />
      <MetricTile label="警告" :value="summary.warningCount" />
      <MetricTile label="涉及套餐" :value="summary.packageCount" />
      <MetricTile label="今日已处理" :value="summary.resolvedCount" />
    </div>

    <section v-if="topPackages.length" class="panel focus-panel">
      <div class="panel-head">
        <h2>优先处理套餐</h2>
        <span class="muted-cell">按高危程度、预警数量和动作优先级排序</span>
      </div>
      <div class="focus-grid">
        <article v-for="item in topPackages" :key="item.packageId" class="focus-card" @click="goAnalysis(item.packageId)">
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
            <el-button size="small" @click.stop="goAnalysis(item.packageId)">查看套餐</el-button>
            <el-button
              size="small"
              type="success"
              :disabled="!item.alertIds?.length"
              :loading="resolving"
              @click.stop="resolveBatch(item.alertIds, '该套餐预警已处理')"
            >
              处理该套餐
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <div class="filter-bar alert-filter">
      <el-input v-model="filters.keyword" clearable placeholder="搜索套餐 / 商家 / 区域" />
      <el-select v-model="filters.level" clearable placeholder="预警等级">
        <el-option label="高危" value="danger" />
        <el-option label="警告" value="warning" />
        <el-option label="提醒" value="info" />
      </el-select>
      <el-select v-model="filters.type" clearable filterable placeholder="预警类型">
        <el-option v-for="(label, value) in alertTypeLabels" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button @click="clearFilters">清空筛选</el-button>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>待处理预警</h2>
        <div class="panel-actions">
          <span class="muted-cell">共 {{ pagination.total }} 条，当前页 {{ alerts.length }} 条</span>
          <el-button type="success" :disabled="!alerts.length" :loading="resolving" @click="resolveCurrentPage">
            处理当前页
          </el-button>
        </div>
      </div>
      <el-table :data="alerts" height="620" empty-text="暂无待处理预警">
        <el-table-column label="级" width="52" sortable>
          <template #default="{ row }">
            <el-tag :type="row.level === 'danger' ? 'danger' : 'warning'" effect="plain" size="small">
              {{ row.priorityScore ?? 0 }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="60">
          <template #default="{ row }">
            <el-tag :type="riskTagType(row.level)" effect="dark" size="small">{{ levelText(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ alertTypeLabels[row.type] ?? row.type }}</template>
        </el-table-column>
        <el-table-column prop="packageName" label="套餐" min-width="160" show-overflow-tooltip />
        <el-table-column prop="merchantName" label="商家" min-width="110" show-overflow-tooltip />
        <el-table-column prop="areaName" label="区域" width="68" />
        <el-table-column prop="reason" label="触发原因" min-width="150" show-overflow-tooltip />
        <el-table-column prop="action" label="下一步动作" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openAlert(row)">处理卡</el-button>
            <el-button size="small" @click="resolve(row.alertId)">标记处理</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="alert-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[50, 80, 120]"
          layout="total, sizes, prev, pager, next"
          :total="pagination.total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <el-drawer v-model="drawerVisible" title="预警处理卡" size="440px" class="alert-drawer">
      <div v-if="selectedAlert" class="alert-detail">
        <el-tag :type="riskTagType(selectedAlert.level)" effect="dark">{{ levelText(selectedAlert.level) }}</el-tag>
        <h3>{{ selectedAlert.title }}</h3>
        <p class="muted-cell">{{ selectedAlert.packageName }}</p>
        <dl>
          <div>
            <dt>商家</dt>
            <dd>{{ selectedAlert.merchantName }}</dd>
          </div>
          <div>
            <dt>区域</dt>
            <dd>{{ selectedAlert.areaName }}</dd>
          </div>
          <div>
            <dt>触发原因</dt>
            <dd>{{ selectedAlert.reason }}</dd>
          </div>
          <div>
            <dt>下一步动作</dt>
            <dd>{{ selectedAlert.action }}</dd>
          </div>
        </dl>
        <div class="drawer-actions">
          <el-button @click="drawerVisible = false">返回预警列表</el-button>
          <el-button @click="goAnalysis(selectedAlert.packageId)">查看套餐</el-button>
          <el-button type="primary" @click="goBattleCard(selectedAlert.packageId)">生成作战卡</el-button>
          <el-button type="success" @click="resolve(selectedAlert.alertId)">标记已处理</el-button>
        </div>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { OperationAlert } from '@content/shared';
import MetricTile from '../components/MetricTile.vue';
import { api, type AlertsResponse } from '../services/api';
import { useRoleStore } from '../stores/role';
import { alertTypeLabels, riskTagType, levelText } from '../utils/labels';
import { usePackageNavigation } from '../utils/navigation';

interface AlertSummary {
  totalCount: number;
  activeCount: number;
  resolvedCount: number;
  dangerCount: number;
  warningCount: number;
  infoCount: number;
  packageCount: number;
  typeDistribution: Record<string, number>;
}

interface AlertPackageFocus {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  alertCount: number;
  dangerCount: number;
  warningCount: number;
  priorityScore: number;
  mainReason: string;
  nextAction: string;
  alertIds: string[];
  types: OperationAlert['type'][];
}

interface AlertResponse {
  items: (OperationAlert & { priorityScore?: number })[];
  summary: AlertSummary;
  topPackages: AlertPackageFocus[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const router = useRouter();
const roleStore = useRoleStore();
const loading = ref(false);
const resolving = ref(false);
const loadError = ref<string | null>(null);
const alerts = ref<(OperationAlert & { priorityScore?: number })[]>([]);
const alertResponse = ref<AlertResponse | null>(null);
const drawerVisible = ref(false);
const selectedAlert = ref<(OperationAlert & { priorityScore?: number }) | null>(null);
const filters = reactive({ keyword: '', level: '', type: '' });
const pagination = reactive({ page: 1, pageSize: 80, total: 0, totalPages: 1 });
let filterTimer: ReturnType<typeof window.setTimeout> | undefined;

const fallbackSummary = {
  totalCount: 0,
  activeCount: 0,
  resolvedCount: 0,
  dangerCount: 0,
  warningCount: 0,
  infoCount: 0,
  packageCount: 0
};

const summary = computed(() => alertResponse.value?.summary ?? fallbackSummary);
const topPackages = computed(() => alertResponse.value?.topPackages ?? []);

// tagType / levelText 已从 utils/labels.ts 导入为 riskTagType / levelText

const load = async (force = false) => {
  loading.value = true;
  loadError.value = null;
  try {
    if (force) api.clearCache();
    const data = await api.getAlerts({
      role: roleStore.currentRole,
      keyword: filters.keyword.trim() || undefined,
      level: filters.level || undefined,
      type: filters.type || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize
    }) as AlertResponse;
    alertResponse.value = data;
    alerts.value = data.items ?? [];
    pagination.page = data.pagination?.page ?? pagination.page;
    pagination.pageSize = data.pagination?.pageSize ?? pagination.pageSize;
    pagination.total = data.pagination?.total ?? alerts.value.length;
    pagination.totalPages = data.pagination?.totalPages ?? 1;
  } catch (e: unknown) {
    loadError.value = '预警数据加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const resolve = async (alertId: string) => {
  await resolveBatch([alertId]);
};

const resolveBatch = async (alertIds: string[], successText = '已标记处理，今日不会再进入待办') => {
  const ids = [...new Set((alertIds ?? []).filter(Boolean))];
  if (!ids.length) {
    ElMessage.warning('当前没有可处理的预警');
    return;
  }

  resolving.value = true;
  try {
    await api.resolveAlerts(ids);
    if (selectedAlert.value && ids.includes(selectedAlert.value.alertId)) {
      drawerVisible.value = false;
      selectedAlert.value = null;
    }
    await load(true);
    ElMessage.success(successText);
  } finally {
    resolving.value = false;
  }
};

const resolveCurrentPage = async () => {
  await resolveBatch(
    alerts.value.map((item) => item.alertId),
    `已处理当前页 ${alerts.value.length} 条预警`
  );
};

const handlePageChange = async (page: number) => {
  pagination.page = page;
  await load(true);
};

const handleSizeChange = async (pageSize: number) => {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  await load(true);
};

const openAlert = (alert: OperationAlert & { priorityScore?: number }) => {
  selectedAlert.value = alert;
  drawerVisible.value = true;
};

const clearFilters = () => {
  filters.keyword = '';
  filters.level = '';
  filters.type = '';
  pagination.page = 1;
};

const { goAnalysis, goBattleCard } = usePackageNavigation(router);

watch(
  () => [filters.keyword, filters.level, filters.type, roleStore.currentRole],
  () => {
    pagination.page = 1;
    if (filterTimer) window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => load(true), 250);
  }
);

onMounted(load);
</script>

<style scoped>
.alerts-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.alerts-hero h2 {
  margin: 0;
  font-size: 24px;
}

.alerts-hero p:not(.eyebrow) {
  margin: 8px 0 0;
  color: var(--muted);
}

.alert-filter {
  padding: 0;
}

.alert-filter .el-input {
  width: 200px;
}

.alert-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
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

.focus-actions,
.panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.focus-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 12px;
}

.panel-actions {
  flex-wrap: wrap;
}

.alert-detail h3 {
  margin: 14px 0 6px;
  color: var(--ink);
}

.alert-detail dl {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 18px 0;
}

.alert-detail dl div {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.alert-detail dt {
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 12px;
}

.alert-detail dd {
  margin: 0;
  color: var(--ink);
  line-height: 1.6;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.alert-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
}
</style>

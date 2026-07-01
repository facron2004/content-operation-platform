<template>
  <section v-loading="loading" class="page-stack alerts-page">
    <section class="alerts-hero">
      <div>
        <p class="eyebrow">Risk Control Desk</p>
        <h2>异常预警中心</h2>
        <p>只展示今日未处理预警。处理后会写入本地状态，刷新页面不会再回到待办里。</p>
      </div>
      <div class="hero-actions">
        <div class="hero-chip">
          <span>待处理</span>
          <strong>{{ summary.activeCount }}</strong>
        </div>
        <div class="hero-chip danger-chip">
          <span>高危</span>
          <strong>{{ summary.dangerCount }}</strong>
        </div>
        <el-button type="primary" :loading="loading" @click="load(true)">刷新预警</el-button>
      </div>
    </section>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      closable
      class="page-alert"
    />

    <AlertMetrics :summary="summary" />

    <FocusPackageGrid
      :top-packages="topPackages"
      :resolving="resolving"
      @navigate="goAnalysis"
      @resolve-batch="resolveBatch"
    />

    <AlertFilters
      :filters="filters"
      @update:keyword="filters.keyword = $event"
      @update:level="filters.level = $event"
      @update:type="filters.type = $event"
      @clear="clearFilters"
    />

    <AlertTable
      :alerts="alerts"
      :pagination="pagination"
      :resolving="resolving"
      @open-detail="openAlert"
      @resolve="resolve"
      @resolve-page="resolveCurrentPage"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <el-drawer v-model="drawerVisible" title="预警处理卡" size="440px" class="alert-drawer">
      <div v-if="selectedAlert" class="alert-detail">
        <el-tag :type="riskTagType(selectedAlert.level)" effect="dark">
          {{ levelText(selectedAlert.level) }}
        </el-tag>
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
          <el-button type="primary" @click="goBattleCard(selectedAlert.packageId)">
            生成作战卡
          </el-button>
          <el-button type="success" @click="resolve(selectedAlert.alertId)">标记已处理</el-button>
        </div>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { OperationAlert } from '@content/shared';
import { useRoleStore } from '../stores/role';
import { riskTagType, levelText } from '../utils/labels';
import { usePackageNavigation } from '../utils/navigation';
import { useAlerts } from '../features/alerts/composables/useAlerts';
import AlertMetrics from '../features/alerts/components/AlertMetrics.vue';
import FocusPackageGrid from '../features/alerts/components/FocusPackageGrid.vue';
import AlertFilters from '../features/alerts/components/AlertFilters.vue';
import AlertTable from '../features/alerts/components/AlertTable.vue';

const router = useRouter();
const roleStore = useRoleStore();
const currentRole = computed(() => roleStore.currentRole);
const drawerVisible = ref(false);
const selectedAlert = ref<(OperationAlert & { priorityScore?: number }) | null>(null);

const {
  loading,
  resolving,
  loadError,
  alerts,
  summary,
  topPackages,
  filters,
  pagination,
  load,
  resolve,
  resolveBatch,
  resolveCurrentPage,
  clearFilters,
  handlePageChange,
  handleSizeChange
} = useAlerts(currentRole);

const openAlert = (alert: OperationAlert & { priorityScore?: number }) => {
  selectedAlert.value = alert;
  drawerVisible.value = true;
};

const { goAnalysis, goBattleCard } = usePackageNavigation(router);

onMounted(load);
</script>

<style scoped>
.alerts-page {
  gap: 12px;
}

.alerts-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top right, rgba(220, 38, 38, 0.08), transparent 30%),
    linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  box-shadow: var(--shadow-soft);
}

.alerts-hero h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
}

.alerts-hero p:not(.eyebrow) {
  max-width: 60ch;
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.hero-chip {
  display: grid;
  gap: 4px;
  min-width: 92px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.hero-chip span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.hero-chip strong {
  color: var(--ink);
  font-size: 18px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.danger-chip strong {
  color: var(--danger);
}

.page-alert {
  margin-bottom: 0;
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
  background: var(--soft, #f8fafc);
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

@media (max-width: 960px) {
  .alerts-hero,
  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions {
    justify-content: flex-start;
  }
}
</style>

<template>
  <section v-loading="loading" class="page-stack ops-console">
    <section class="ops-hero panel">
      <div class="ops-hero-content">
        <div class="hero-kicker-row">
          <p class="eyebrow">{{ consoleData.date || todayText }} / 本地生活运营中台</p>
          <el-tag size="small" effect="plain">{{ summary.dataSource }}</el-tag>
        </div>
        <h2>今日运营作战面板</h2>
        <p class="hero-description">
          聚焦销售中套餐、风险预警、爆品机会与社群动作，用一屏把今天必须做的事排清楚。
        </p>
        <div class="ops-source-row">
          <el-tag size="small" type="success" effect="plain">仅销售中</el-tag>
          <span class="source-stat">更新 {{ formatTime(summary.updatedAt) }}</span>
          <span class="source-stat">均分 {{ summary.avgScore }}</span>
          <span class="source-stat">待处理 {{ summary.activeAlertCount }}</span>
          <span class="source-stat">已处理 {{ summary.resolvedAlertCount }}</span>
        </div>
      </div>
      <div class="hero-actions">
        <div class="hero-summary-card">
          <span>今日优先级</span>
          <strong>{{ activeFocusLabel }}</strong>
          <small>切换焦点后，列表会自动聚焦到对应任务</small>
        </div>
        <el-button type="primary" size="small" :loading="loading" @click="load(true)">
          刷新数据
        </el-button>
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

    <DashboardMetrics :summary="summary" />

    <section class="focus-strip panel">
      <div class="focus-strip-head">
        <div>
          <h3>任务焦点</h3>
          <p>选择视角后只看当前最值得处理的一类内容。</p>
        </div>
      </div>
      <el-radio-group v-model="activeFocus" size="small" class="focus-toggle">
        <el-radio-button label="all">全局</el-radio-button>
        <el-radio-button label="push">必推</el-radio-button>
        <el-radio-button label="risk">风险</el-radio-button>
        <el-radio-button label="hot">爆品</el-radio-button>
        <el-radio-button label="slow">滞销</el-radio-button>
        <el-radio-button label="community">社群</el-radio-button>
        <el-radio-button label="review">复盘</el-radio-button>
      </el-radio-group>
    </section>

    <div v-if="['all', 'push', 'risk'].includes(activeFocus)" class="ops-grid">
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'push'"
        title="今日必推"
        subtitle="优先级最高，适合直接推动转化"
        empty-text="暂无必推套餐"
        :items="consoleData.mustPushPackages ?? []"
        @open="openAnalysis"
        @generate="goBattleCard"
      />
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'risk'"
        title="今日风险套餐"
        subtitle="需要尽快止损、复核或安排补救"
        empty-text="暂无风险套餐"
        :items="consoleData.riskPackages ?? []"
        danger
        @open="openAnalysis"
        @generate="goBattleCard"
      />
    </div>

    <div v-if="['all', 'hot', 'slow'].includes(activeFocus)" class="ops-grid">
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'hot'"
        title="今日爆品机会"
        subtitle="适合放大曝光和重点推送"
        empty-text="暂无爆品机会"
        :items="consoleData.hotOpportunities ?? []"
        @open="openAnalysis"
        @generate="goBattleCard"
      />
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'slow'"
        title="今日滞销套餐"
        subtitle="需要通过定价、话术或社群动作提振"
        empty-text="暂无滞销套餐"
        :items="consoleData.slowMovingPackages ?? []"
        danger
        @open="openAnalysis"
        @generate="goBattleCard"
      />
    </div>

    <div v-if="['all', 'community', 'review'].includes(activeFocus)" class="ops-grid">
      <CommunityTaskPanel
        v-if="activeFocus === 'all' || activeFocus === 'community'"
        :tasks="consoleData.communityTasks ?? []"
        @navigate="$router.push($event)"
        @generate-card="goBattleCard"
      />
      <ReviewPanel
        v-if="activeFocus === 'all' || activeFocus === 'review'"
        :review="consoleData.yesterdayReview"
        @navigate="$router.push($event)"
      />
    </div>

    <AlertPreview
      v-if="activeFocus === 'all'"
      :alerts="consoleData.alerts ?? []"
      @navigate="$router.push($event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRoleStore } from '../stores/role';
import { formatTime } from '../utils/labels';
import { usePackageNavigation } from '../utils/navigation';
import { useDashboard } from '../features/dashboard/composables/useDashboard';
import DashboardMetrics from '../features/dashboard/components/DashboardMetrics.vue';
import CommunityTaskPanel from '../features/dashboard/components/CommunityTaskPanel.vue';
import ReviewPanel from '../features/dashboard/components/ReviewPanel.vue';
import AlertPreview from '../features/dashboard/components/AlertPreview.vue';
import OperationSection from '../components/OperationSection.vue';

const router = useRouter();
const roleStore = useRoleStore();
const currentRole = computed(() => roleStore.currentRole);
const { loading, loadError, consoleData, activeFocus, summary, todayText, load } =
  useDashboard(currentRole);
const { goAnalysis: openAnalysis, goBattleCard } = usePackageNavigation(router);

const focusLabels: Record<string, string> = {
  all: '全局视角',
  push: '必推优先',
  risk: '风险优先',
  hot: '爆品优先',
  slow: '滞销优先',
  community: '社群动作',
  review: '昨日复盘'
};

const activeFocusLabel = computed(() => focusLabels[activeFocus.value] ?? '全局视角');

onMounted(load);
</script>

<style scoped>
.ops-console {
  gap: 12px;
}

.ops-hero {
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

.ops-hero-content {
  min-width: 0;
}

.hero-kicker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ops-hero h2 {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.hero-description {
  max-width: 62ch;
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.ops-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
}

.source-stat {
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  min-width: 190px;
}

.hero-summary-card {
  display: grid;
  gap: 4px;
  min-width: 190px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.hero-summary-card span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.hero-summary-card strong {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.hero-summary-card small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.focus-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.focus-strip-head h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.focus-strip-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.focus-toggle {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page-alert {
  margin-bottom: 0;
}

.ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

@media (max-width: 1280px) {
  .ops-hero,
  .focus-strip {
    flex-direction: column;
  }

  .hero-actions {
    align-items: flex-start;
    min-width: 0;
  }

  .focus-strip {
    align-items: stretch;
  }

  .focus-toggle {
    justify-content: flex-start;
  }
}
</style>

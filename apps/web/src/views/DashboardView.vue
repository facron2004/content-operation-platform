<template>
  <section v-loading="loading" class="page-stack ops-console">
    <section class="ops-hero">
      <div class="ops-hero-content">
        <p class="eyebrow">{{ consoleData.date || todayText }} / 本地生活运营中台</p>
        <h2>今日运营作战面板</h2>
        <div class="ops-source-row">
          <el-tag size="small" effect="plain">{{ summary.dataSource ?? 'JeeSite' }}</el-tag>
          <el-tag size="small" type="success" effect="plain">仅销售中</el-tag>
          <span class="source-stat">更新 {{ formatTime(summary.updatedAt) }}</span>
          <span class="source-stat">均分 {{ summary.avgScore ?? 0 }}</span>
          <span class="source-stat">待处理 {{ summary.activeAlertCount ?? 0 }}</span>
          <span class="source-stat">已处理 {{ summary.resolvedAlertCount ?? 0 }}</span>
        </div>
      </div>
      <el-button type="primary" size="small" :loading="loading" @click="load(true)">刷新</el-button>
    </section>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      closable
      style="margin-bottom: 12px"
    />

    <DashboardMetrics :summary="summary" />

    <div class="focus-toggle">
      <el-radio-group v-model="activeFocus" size="small">
        <el-radio-button label="all">全局</el-radio-button>
        <el-radio-button label="push">必推</el-radio-button>
        <el-radio-button label="risk">风险</el-radio-button>
        <el-radio-button label="hot">爆品</el-radio-button>
        <el-radio-button label="slow">滞销</el-radio-button>
        <el-radio-button label="community">社群</el-radio-button>
        <el-radio-button label="review">复盘</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="['all', 'push', 'risk'].includes(activeFocus)" class="ops-grid">
      <OperationSection
        v-if="activeFocus === 'all' || activeFocus === 'push'"
        title="今日必推"
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

    <div v-if="['all', 'hot', 'slow'].includes(activeFocus)" class="ops-grid">
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

onMounted(load);
</script>

<style scoped>
.ops-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
}

.ops-hero h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.ops-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}

.source-stat {
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}

.focus-toggle {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
</style>

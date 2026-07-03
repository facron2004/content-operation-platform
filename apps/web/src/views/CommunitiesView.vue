<template>
  <section v-loading="loading" class="page-stack">
    <ErrorAlert :message="loadError" style="margin-bottom: 12px" />
    <div class="community-toolbar">
      <div>
        <p class="eyebrow">Community Operations</p>
        <h2>社群运营模块</h2>
      </div>
      <el-button type="primary" :loading="loading" @click="load(true)">刷新社群匹配</el-button>
    </div>

    <div class="community-grid">
      <article v-for="group in communities" :key="group.groupId" class="community-card">
        <div class="community-head">
          <div>
            <strong>{{ group.groupName }}</strong>
            <span>
              {{ group.areaName }} / {{ groupTypeLabels[group.groupType] ?? group.groupType }}
            </span>
          </div>
          <el-tag type="success" effect="plain">活跃 {{ group.activityScore }}</el-tag>
        </div>

        <div class="community-metrics">
          <div>
            <span>人数</span>
            <strong>{{ group.memberCount }}</strong>
          </div>
          <div>
            <span>历史转化</span>
            <strong>{{ formatPercent(group.historicalConversionRate) }}</strong>
          </div>
          <div>
            <span>适合品类</span>
            <strong>{{ group.preferredCategories.join('、') }}</strong>
          </div>
        </div>

        <div class="community-packages">
          <h3>今日推荐套餐</h3>
          <div
            v-for="pkg in group.todayRecommendedPackages"
            :key="pkg.packageId"
            class="community-package"
          >
            <div>
              <strong>{{ pkg.packageName }}</strong>
              <span>{{ pkg.reason }}</span>
            </div>
            <el-button
              size="small"
              @click="
                $router.push({
                  path: '/generate',
                  query: { packageId: pkg.packageId, mode: 'battle-card' }
                })
              "
            >
              作战卡
            </el-button>
          </div>
        </div>
      </article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>推送记录与转化数据</h2>
      </div>
      <el-table :data="pushRows" height="320" empty-text="暂无社群任务">
        <el-table-column prop="groupName" label="社群" min-width="150" />
        <el-table-column
          prop="packageName"
          label="推荐套餐"
          min-width="200"
          show-overflow-tooltip
        />
        <el-table-column prop="plannedTime" label="推送时间" width="90" />
        <el-table-column prop="reason" label="推荐原因" min-width="200" show-overflow-tooltip />
        <el-table-column
          prop="nextAction"
          label="下一步动作"
          min-width="180"
          show-overflow-tooltip
        />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { CommunityGroup, OperationCard } from '@content/shared';
import { api } from '../services/api';
import { useRoleStore } from '../stores/role';
import { groupTypeLabels, percent as formatPercent } from '../utils/labels';
import { useApiFetch } from '../composables/useApiFetch';
import ErrorAlert from '../components/ErrorAlert.vue';

interface CommunitiesData {
  items: CommunityGroup[];
}

const roleStore = useRoleStore();
const {
  loading,
  data,
  error: loadError,
  load
} = useApiFetch<CommunitiesData>(() => api.getCommunities({ role: roleStore.currentRole }), {
  errorMessage: '社群数据加载失败，请稍后重试'
});

const communities = computed(() => data.value?.items ?? []);

/** 根据社群类型和索引生成合理的推送时间 */
const plannedTimeForGroup = (groupType: string, index: number): string => {
  const timeSlots: Record<string, string[]> = {
    office: ['12:00', '18:00'],
    parent_child: ['10:00', '15:30'],
    foodie: ['11:30', '17:30'],
    merchant: ['09:30', '14:00'],
    wellness: ['14:00', '20:00'],
    mixed: ['11:00', '17:00']
  };
  const slots = timeSlots[groupType] ?? timeSlots.mixed;
  return slots[index % slots.length];
};

const pushRows = computed(() =>
  communities.value.flatMap((group) => {
    const pkg: OperationCard | undefined = group.todayRecommendedPackages?.[0];
    if (!pkg) return [];
    return [
      {
        groupName: group.groupName,
        packageName: pkg.packageName,
        plannedTime: plannedTimeForGroup(group.groupType, 0),
        reason: pkg.reason,
        nextAction: pkg.nextAction
      }
    ];
  })
);

onMounted(() => load());

// 角色切换后自动刷新社群数据
watch(
  () => roleStore.currentRole,
  () => load(true)
);
</script>

<style scoped>
.community-toolbar,
.community-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.community-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px;
}

.community-toolbar h2 {
  margin: 0;
  font-size: 24px;
}

.community-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.community-card {
  padding: 14px;
}

.community-head,
.community-package {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.community-head strong,
.community-package strong {
  display: block;
  color: var(--ink);
  line-height: 1.4;
}

.community-head span,
.community-package span,
.community-metrics span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.community-metrics {
  display: grid;
  grid-template-columns: 70px 92px minmax(0, 1fr);
  gap: 8px;
  margin: 14px 0;
}

.community-metrics div {
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--soft, #f8fafc);
}

.community-metrics strong {
  display: block;
  margin-top: 4px;
  word-break: break-word;
}

.community-packages h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.community-package {
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
</style>

<template>
  <el-card v-loading="loading" class="community-detail-card" shadow="never">
    <template v-if="community">
      <ErrorAlert :message="detailError" />
      <div class="card-header">
        <div class="title-row">
          <h3 class="community-name">{{ community.groupName }}</h3>
          <el-tag size="small" effect="plain">
            {{ groupTypeLabels[community.groupType] ?? community.groupType }}
          </el-tag>
          <el-tag :type="community.isActive ? 'success' : 'danger'" size="small">
            {{ community.isActive ? '启用中' : '已停用' }}
          </el-tag>
        </div>
      </div>

      <el-descriptions :column="2" border class="detail-descriptions">
        <el-descriptions-item label="所属区域">
          {{ community.areaName || community.areaId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="负责人">
          {{ community.ownerName || community.ownerId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="成员数">
          {{ community.memberCount.toLocaleString('zh-CN') }}
        </el-descriptions-item>
        <el-descriptions-item label="活跃度">
          <el-tag :type="activityTagType[community.activityLevel] ?? 'info'" size="small">
            {{ activityLabels[community.activityLevel] ?? community.activityLevel }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="来源">{{ community.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="标签">
          <template v-if="community.tags?.length">
            <el-tag
              v-for="tag in community.tags"
              :key="tag"
              size="small"
              effect="plain"
              class="tag-item"
            >
              {{ tag }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(community.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(community.updatedAt) }}
        </el-descriptions-item>
        <!-- Residual #252: #236 write fields already returned by API; surface on detail. -->
        <el-descriptions-item label="偏好品类" :span="2">
          <template v-if="community.preferredCategories?.length">
            <el-tag
              v-for="cat in community.preferredCategories"
              :key="cat"
              size="small"
              effect="plain"
              class="tag-item"
            >
              {{ cat }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="负责人电话">
          <!-- API maskPhone — last-4 only, never raw PII. -->
          {{ community.ownerPhone || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          <div class="note-text">{{ community.note || '-' }}</div>
        </el-descriptions-item>
      </el-descriptions>

      <div class="performance-section">
        <!-- Residual #256: prefer API dateFrom/dateTo over hard-coded 90d label. -->
        <h4 class="section-title">任务表现（{{ performanceWindowLabel }}）</h4>
        <ErrorAlert :message="performanceError" />
        <div v-if="performance" class="metric-grid">
          <div class="metric-item">
            <span class="metric-value">
              {{ (performance.totalTasks ?? 0).toLocaleString('zh-CN') }}
            </span>
            <span class="metric-label">任务总数</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">
              {{ (performance.completedTasks ?? 0).toLocaleString('zh-CN') }}
            </span>
            <span class="metric-label">已完成</span>
          </div>
          <div class="metric-item">
            <span
              class="metric-value"
              :class="{ 'metric-danger': (performance.failedTasks ?? 0) > 0 }"
            >
              {{ (performance.failedTasks ?? 0).toLocaleString('zh-CN') }}
            </span>
            <span class="metric-label">已失败</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">{{ displayMoney(performance, 'totalGmv') }}</span>
            <span class="metric-label">累计 GMV</span>
          </div>
        </div>
        <el-empty v-else-if="!loading" description="暂无社群表现数据" :image-size="60" />
      </div>

      <!-- Residual #209: todayRecommendedPackages via getCommunityRecommendations. -->
      <div v-loading="packagesLoading" class="packages-section">
        <ErrorAlert :message="packagesError" />
        <CommunityPackageList v-if="packages.length" :packages="packages" />
        <template v-else-if="!packagesLoading">
          <h4 class="section-title">今日推荐套餐</h4>
          <el-empty description="暂无今日推荐套餐" :image-size="60" />
        </template>
      </div>

      <!-- Residual #186: nested community tasks (API getCommunityTasks existed unused). -->
      <div class="tasks-section">
        <div class="section-header">
          <h4 class="section-title">
            近期任务（{{ tasksWindowLabel }}）
            <span v-if="tasksTotal > 0" class="section-count">（共 {{ tasksTotal }}）</span>
          </h4>
          <div v-if="community.groupId" class="section-actions">
            <!-- Residual #198: deep-link create with group scope + create=1 auto-open. -->
            <AppleButton variant="primary" size="sm" @click="goCreateTask">新建任务</AppleButton>
            <!-- Residual #245: deep-link batch create (batch=1) with group scope — campaign #212 parity. -->
            <AppleButton variant="secondary" size="sm" @click="goBatchCreateTask">
              批量建任务
            </AppleButton>
            <AppleButton variant="ghost" size="sm" @click="goTaskCenter">任务中心</AppleButton>
          </div>
        </div>
        <ErrorAlert :message="tasksError" />
        <el-table
          v-loading="tasksLoading"
          :data="tasks"
          size="small"
          stripe
          :empty-text="`${tasksWindowLabel}暂无任务`"
          style="width: 100%"
        >
          <el-table-column label="标题" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <AppleButton variant="ghost" size="sm" class="task-link" @click="goTask(row.taskId)">
                {{ row.title || row.packageName || shortId(row.taskId) }}
              </AppleButton>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <TaskStatusTag :status="row.status" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="排期" width="140">
            <template #default="{ row }">{{ formatDateTime(row.plannedAt) }}</template>
          </el-table-column>
        </el-table>
        <!-- Residual #239: nested community tasks pagination (API getCommunityTasks page/pageSize ready). -->
        <div v-if="tasksTotal > tasksPageSize" class="tasks-pagination">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="tasksTotal"
            :page-size="tasksPageSize"
            :current-page="tasksPage"
            @current-change="(page: number) => emit('update:tasksPage', page)"
          />
        </div>
      </div>
    </template>

    <el-empty v-else-if="!loading" description="未选择社群" :image-size="100" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type {
  CommunityGroup,
  CommunityGroupEntity,
  CommunityPerformanceResponse,
  DistributionTask
} from '@content/shared';
import { displayMoney } from '../../../utils/format';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import AppleButton from '../../../components/AppleButton.vue';
import TaskStatusTag from '../../task-center/components/TaskStatusTag.vue';
import CommunityPackageList from '../../communities/components/CommunityPackageList.vue';

type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';
type RecommendedPackages = CommunityGroup['todayRecommendedPackages'];

const props = withDefaults(
  defineProps<{
    community: CommunityGroupEntity | null;
    loading: boolean;
    detailError?: string | null;
    // Residual #179: community-scoped performance (was wrongly visit/order rate shape).
    performance?: CommunityPerformanceResponse | null;
    performanceError?: string | null;
    // Residual #186/#239: paginated community tasks.
    tasks?: DistributionTask[];
    tasksTotal?: number;
    tasksPage?: number;
    tasksPageSize?: number;
    tasksLoading?: boolean;
    tasksError?: string | null;
    // Residual #271: INTERACTIVE_LIST_MAX_DAYS window honesty.
    tasksWindowLabel?: string;
    // Residual #209: today recommended OperationCard[] from content console.
    packages?: RecommendedPackages;
    packagesLoading?: boolean;
    packagesError?: string | null;
  }>(),
  {
    performance: null,
    detailError: null,
    performanceError: null,
    tasks: () => [],
    tasksTotal: 0,
    tasksPage: 1,
    tasksPageSize: 10,
    tasksLoading: false,
    tasksError: null,
    tasksWindowLabel: '近 90 天',
    packages: () => [],
    packagesLoading: false,
    packagesError: null
  }
);

const emit = defineEmits<{
  'update:tasksPage': [page: number];
}>();

const router = useRouter();

const groupTypeLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

const activityLabels: Record<string, string> = {
  high: '高活跃',
  medium: '中活跃',
  low: '低活跃'
};

const activityTagType: Record<string, TagType> = {
  high: 'success',
  medium: 'warning',
  low: 'info'
};

// Residual #256: performance payload carries dateFrom/dateTo (INTERACTIVE_LIST_MAX_DAYS).
const performanceWindowLabel = computed(() => {
  const from = props.performance?.dateFrom;
  const to = props.performance?.dateTo;
  if (from && to) return `${from} ~ ${to}`;
  return '近 90 天';
});

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}

function shortId(id?: string): string {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function goTask(taskId: string) {
  if (!taskId) return;
  router.push({ name: 'task-detail', params: { taskId } });
}

function goTaskCenter() {
  const groupId = props.community?.groupId;
  router.push({ name: 'tasks', query: groupId ? { groupId } : {} });
}

/** Residual #198: open task center create dialog pre-seeded with this community. */
function goCreateTask() {
  const groupId = props.community?.groupId;
  if (!groupId) return;
  router.push({ name: 'tasks', query: { groupId, create: '1' } });
}

/** Residual #245: open task center batch dialog pre-seeded with this community (campaign #212 parity). */
function goBatchCreateTask() {
  const groupId = props.community?.groupId;
  if (!groupId) return;
  router.push({ name: 'tasks', query: { groupId, batch: '1' } });
}
</script>

<style scoped src="../../../styles/components/community-detail-card.css"></style>

<template>
  <section v-loading="loading" class="page-stack user-lifecycle-view">
    <div class="page-toolbar">
      <el-button v-if="canRefresh" :loading="loading || refreshing" @click="refreshMembers">
        <el-icon><Refresh /></el-icon>
        同步并刷新
      </el-button>
      <el-button v-else :loading="loading" @click="load">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <span v-if="refreshStatusText" class="user-lifecycle-refresh-status">
        {{ refreshStatusText }}
      </span>
    </div>

    <ErrorAlert :message="error" />
    <ErrorAlert :message="refreshError" />

    <div class="user-lifecycle-metrics">
      <article class="user-lifecycle-metric panel">
        <span>用户总数</span>
        <strong>{{ formatCount(summary.totalMembers) }}</strong>
        <small>
          {{ dataSources.includes('JeeSite Member') ? 'JeeSite 会员主档' : '当前 Member 档案' }}
        </small>
      </article>
      <article class="user-lifecycle-metric panel">
        <span>已付费用户</span>
        <strong>{{ formatCount(summary.paidMembers) }}</strong>
        <small>至少完成一笔支付</small>
      </article>
      <article class="user-lifecycle-metric panel user-lifecycle-metric--accent">
        <span>近 30 天活跃</span>
        <strong>{{ formatCount(summary.activeMembers30d) }}</strong>
        <small>新客 + 活跃用户</small>
      </article>
      <article class="user-lifecycle-metric panel">
        <span>待挽回用户</span>
        <strong>{{ formatCount(summary.atRiskMembers + summary.churnedMembers) }}</strong>
        <small>沉睡预警 + 流失</small>
      </article>
      <article class="user-lifecycle-metric panel">
        <span>累计付费 GMV</span>
        <strong>{{ displayFen(summary.totalPaidGmvFen) }}</strong>
        <small>按 paidTime 统计</small>
      </article>
    </div>

    <section class="user-lifecycle-stage-grid">
      <button
        v-for="item in stages"
        :key="item.key"
        type="button"
        class="user-lifecycle-stage panel"
        :class="{ 'is-active': stage === item.key }"
        @click="applyStage(stage === item.key ? '' : item.key)"
      >
        <span class="user-lifecycle-stage__top">
          <strong>{{ item.label }}</strong>
          <small>{{ item.percentage }}%</small>
        </span>
        <b>{{ formatCount(item.memberCount) }}</b>
        <el-progress :percentage="item.percentage" :show-text="false" :stroke-width="6" />
        <small>{{ item.description }}</small>
      </button>
    </section>

    <section class="panel user-lifecycle-table-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">STAGE MEMBERS</p>
          <h2>{{ stage ? stages.find((item) => item.key === stage)?.label : '已同步行为用户' }}</h2>
        </div>
        <div class="user-lifecycle-table-actions">
          <el-select :model-value="stage" clearable placeholder="按阶段筛选" @change="applyStage">
            <el-option
              v-for="item in stages"
              :key="item.key"
              :label="item.label"
              :value="item.key"
            />
          </el-select>
          <span class="section-meta">共 {{ formatCount(pagination.total) }} 人</span>
        </div>
      </div>

      <el-table :data="items" row-key="memberId">
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div class="lifecycle-user-cell">
              <strong>{{ row.nickname || '未命名用户' }}</strong>
              <small>{{ row.phone || row.memberId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="生命周期" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="stageType(row.stage)">{{ row.stageLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="100">
          <template #default="{ row }">{{ row.level || '普通' }}</template>
        </el-table-column>
        <el-table-column label="付费订单" width="110" align="right" prop="paidOrderCount" />
        <el-table-column label="付费 GMV" width="140" align="right">
          <template #default="{ row }">{{ displayFen(row.paidGmvFen) }}</template>
        </el-table-column>
        <el-table-column label="最近支付" width="130">
          <template #default="{ row }">{{ displayDate(row.lastPaidAt) }}</template>
        </el-table-column>
        <el-table-column label="最近活动" width="130">
          <template #default="{ row }">{{ displayDate(row.lastActivityAt) }}</template>
        </el-table-column>
        <el-table-column label="距今" width="100" align="right">
          <template #default="{ row }">
            {{ row.daysSinceLastActivity == null ? '—' : `${row.daysSinceLastActivity} 天` }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && !items.length" description="当前阶段暂无用户" :image-size="56" />
      <div v-if="pagination.total > pagination.pageSize" class="user-lifecycle-pagination">
        <el-pagination
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="setPage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useUserLifecycle } from '../features/user-lifecycle/useUserLifecycle';

const {
  stage,
  loading,
  error,
  refreshError,
  canRefresh,
  refreshing,
  refreshStatusText,
  summary,
  stages,
  items,
  pagination,
  dataSources,
  load,
  refreshMembers,
  applyStage,
  setPage,
  displayFen,
  displayDate,
  stageType
} = useUserLifecycle();

const formatCount = (value: number) => value.toLocaleString('zh-CN');
</script>

<style src="../styles/views/user-lifecycle.css" scoped></style>

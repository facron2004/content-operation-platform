<template>
  <section v-loading="loading" class="page-stack welfare-points">
    <div class="page-toolbar welfare-points__toolbar">
      <div>
        <h2 class="welfare-points__title">会员福利金记录</h2>
        <p class="welfare-points__hint">
          只抓取当前打开的页，外部请求串行执行；历史记录不会被重复全量刷新。
        </p>
      </div>
      <el-button :loading="loading" type="primary" @click="reload">刷新当前页</el-button>
    </div>

    <ErrorAlert :message="error" />

    <section class="panel welfare-points__panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">MEMBER WELFARE POINT RECORDS</p>
          <h3>福利金流水</h3>
        </div>
        <div class="welfare-points__meta">
          <span>总记录 {{ formatCount(total) }}</span>
          <span>{{ sourceLabel(dataSource) }}</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="list"
        row-key="id"
        stripe
        :empty-text="error || '暂无福利金记录'"
      >
        <el-table-column prop="createDate" label="创建时间" width="155" />
        <el-table-column label="会员" min-width="210">
          <template #default="{ row }">
            <div class="welfare-points__member">
              <strong>{{ row.memberName || '未命名会员' }}</strong>
              <small>{{ row.memberPhone || '—' }} · {{ row.centerMemberId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="memberCode" label="邀请码" width="115" />
        <el-table-column label="变动类型" width="95">
          <template #default="{ row }">
            <el-tag :type="row.pointType === 1 ? 'primary' : 'danger'" size="small">
              {{ row.pointTypeLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceTypeLabel" label="来源" width="110" />
        <el-table-column label="变动金额" width="115" align="right">
          <template #default="{ row }">
            <span :class="row.pointType === 1 ? 'is-positive' : 'is-negative'">
              {{ formatYuan(row.pointAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="当前余额" width="115" align="right">
          <template #default="{ row }">{{ formatYuan(row.currentBalance) }}</template>
        </el-table-column>
        <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="changeDesc" label="变更描述" min-width="200" show-overflow-tooltip />
      </el-table>

      <el-empty
        v-if="!loading && !list.length"
        description="当前页暂无福利金记录"
        :image-size="56"
      />
      <div class="welfare-points__pagination">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :pager-count="7"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="changePage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import { useWelfarePoints } from '../features/welfare-points/composables/useWelfarePoints';

const { page, pageSize, total, list, dataSource, loading, error, reload, changePage } =
  useWelfarePoints();

const formatCount = (value: number) => value.toLocaleString('zh-CN');
const formatYuan = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sourceLabel = (source: 'JeeSite' | 'WelfarePointRecord') =>
  source === 'JeeSite' ? '当前页来自 JeeSite' : '当前页来自本地快照';
</script>

<style scoped>
.welfare-points {
  gap: var(--page-gap);
}

.welfare-points__toolbar {
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.welfare-points__title,
.welfare-points__panel h3 {
  margin: 0;
  color: var(--ink);
}

.welfare-points__hint {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.welfare-points__panel {
  min-width: 0;
  padding: 16px;
}

.welfare-points__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.welfare-points__meta span {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--soft);
}

.welfare-points__member {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.welfare-points__member strong,
.welfare-points__member small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welfare-points__member strong {
  color: var(--ink);
  font-size: 13px;
}

.welfare-points__member small {
  color: var(--muted);
  font-size: 11px;
}

.welfare-points :deep(.el-table) {
  --el-table-border-color: var(--line);
  --el-table-header-bg-color: var(--soft);
}

.is-positive {
  color: var(--success, #34c759);
}

.is-negative {
  color: var(--danger, #ff3b30);
}

.welfare-points__pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

@media (max-width: 700px) {
  .welfare-points__toolbar,
  .welfare-points__meta {
    justify-content: flex-start;
  }

  .welfare-points__panel {
    padding: 12px;
  }
}
</style>

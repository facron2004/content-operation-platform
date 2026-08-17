<template>
  <section v-loading="loading" class="page-stack member-integral-records">
    <div class="page-toolbar member-integral-records__toolbar">
      <div>
        <h2 class="member-integral-records__title">会员积分记录</h2>
        <p class="member-integral-records__hint">
          只抓取当前打开的页，外部请求串行执行；不会自动遍历全部记录。
        </p>
      </div>
      <el-button :loading="loading" type="primary" @click="reload">刷新当前页</el-button>
    </div>

    <ErrorAlert :message="error" />

    <section class="panel member-integral-records__panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">MEMBER INTEGRAL RECORDS</p>
          <h3>积分流水</h3>
        </div>
        <div class="member-integral-records__meta">
          <span>总记录 {{ formatCount(total) }}</span>
          <span>{{ sourceLabel(dataSource) }}</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="list"
        row-key="id"
        stripe
        :empty-text="error || '暂无积分记录'"
      >
        <el-table-column prop="createDate" label="创建时间" width="155" />
        <el-table-column label="会员" min-width="210">
          <template #default="{ row }">
            <div class="member-integral-records__member">
              <strong>{{ row.memberName || '未命名会员' }}</strong>
              <small>{{ row.memberPhone || '—' }} · {{ row.centerMemberId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邀请码 / 上级邀请码" min-width="185">
          <template #default="{ row }">
            <div class="member-integral-records__member">
              <span>{{ row.inviteCode || '—' }}</span>
              <small>上级：{{ row.parentInviteCode || '—' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="积分变动" width="115" align="right">
          <template #default="{ row }">
            <strong :class="row.consumptionIntegral < 0 ? 'is-negative' : 'is-positive'">
              {{ formatIntegral(row.consumptionIntegral) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="积分类型" width="105">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.integralTypeLabel }}</el-tag>
            <small class="member-integral-records__code">#{{ row.integralType }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ row.stateLabel }}</el-tag>
            <small class="member-integral-records__code">#{{ row.state }}</small>
          </template>
        </el-table-column>
        <el-table-column prop="orderCode" label="订单号" min-width="170" show-overflow-tooltip />
        <el-table-column label="历史价格" width="110" align="right">
          <template #default="{ row }">{{ formatIntegral(row.historyPrice) }}</template>
        </el-table-column>
        <el-table-column prop="remarks" label="备注" min-width="180" show-overflow-tooltip />
      </el-table>

      <el-empty v-if="!loading && !list.length" description="当前页暂无积分记录" :image-size="56" />
      <div class="member-integral-records__pagination">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :pager-count="7"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="setPage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import { useMemberIntegralRecords } from '../features/member-integral/useMemberIntegralRecords';

const { page, pageSize, total, list, dataSource, loading, error, reload, setPage } =
  useMemberIntegralRecords();

const formatCount = (value: number) => value.toLocaleString('zh-CN');
const formatIntegral = (value: number | null) =>
  value == null
    ? '—'
    : value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sourceLabel = (source: 'JeeSite' | 'MemberIntegralRecord') =>
  source === 'JeeSite' ? '当前页来自 JeeSite' : '当前页来自本地快照';
</script>

<style scoped>
.member-integral-records {
  gap: var(--page-gap);
}

.member-integral-records__toolbar {
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.member-integral-records__title,
.member-integral-records__panel h3 {
  margin: 0;
  color: var(--ink);
}

.member-integral-records__hint {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.member-integral-records__panel {
  min-width: 0;
  padding: 16px;
}

.member-integral-records__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.member-integral-records__meta span {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--soft);
}

.member-integral-records__member {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.member-integral-records__member strong,
.member-integral-records__member span,
.member-integral-records__member small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-integral-records__member strong {
  color: var(--ink);
  font-size: 13px;
}

.member-integral-records__member small,
.member-integral-records__code {
  color: var(--muted);
  font-size: 11px;
}

.member-integral-records__code {
  display: block;
  margin-top: 3px;
}

.member-integral-records :deep(.el-table) {
  --el-table-border-color: var(--line);
  --el-table-header-bg-color: var(--soft);
}

.is-positive {
  color: var(--success, #34c759);
}

.is-negative {
  color: var(--danger, #ff3b30);
}

.member-integral-records__pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

@media (max-width: 700px) {
  .member-integral-records__toolbar,
  .member-integral-records__meta {
    justify-content: flex-start;
  }

  .member-integral-records__panel {
    padding: 12px;
  }
}
</style>

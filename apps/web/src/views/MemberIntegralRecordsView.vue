<template>
  <section v-loading="loading || syncing" class="page-stack member-integral">
    <div class="page-toolbar">
      <el-button v-if="canRefresh" :loading="syncing" @click="reload(true)">
        同步积分数据
      </el-button>
      <el-button v-if="canExport" type="primary" @click="exportCsv">导出 CSV</el-button>
    </div>

    <ErrorAlert :message="loadError" />

    <!-- KPI -->
    <div class="mi-kpi-row">
      <MetricTile label="记录数" :value="fmtInt(summary?.kpis.totalRecords)" />
      <MetricTile label="总增加" :value="fmtNum(summary?.kpis.totalGain)" info />
      <MetricTile label="总消耗" :value="fmtNum(summary?.kpis.totalConsume)" danger />
      <MetricTile label="净变动" :value="fmtNum(summary?.kpis.netChange)" :danger="netNegative" />
      <MetricTile label="参与会员" :value="fmtInt(summary?.kpis.memberCount)" />
      <MetricTile label="历史价格合计" :value="fmtNum(summary?.kpis.totalHistoryPrice)" />
    </div>

    <!-- Filters -->
    <div class="mi-filters panel">
      <el-input v-model="phone" placeholder="手机号 / 推荐码" clearable style="width: 180px" />
      <el-select v-model="integralType" placeholder="积分类型" clearable style="width: 150px">
        <el-option v-for="o in typeOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select v-model="state" placeholder="状态" clearable style="width: 120px">
        <el-option v-for="o in stateOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="~"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 240px"
      />
      <el-input
        v-model="keyword"
        placeholder="关键词(备注/订单号)"
        clearable
        style="width: 200px"
      />
      <el-button type="primary" @click="applyFilters">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <!-- Charts -->
    <div class="mi-charts">
      <div class="panel mi-chart mi-chart-wide">
        <h3 class="mi-chart-title">每日趋势（增加 / 消耗）</h3>
        <ChartPanel :option="trendOption" />
      </div>
      <div class="panel mi-chart">
        <h3 class="mi-chart-title">积分类型分布</h3>
        <ChartPanel :option="typeOption" />
      </div>
      <div class="panel mi-chart">
        <h3 class="mi-chart-title">状态分布</h3>
        <ChartPanel :option="stateOption" />
      </div>
      <div class="panel mi-chart mi-chart-wide">
        <h3 class="mi-chart-title">Top 会员（按净变动）</h3>
        <ChartPanel :option="topMembersOption" />
      </div>
    </div>

    <!-- Table -->
    <div class="panel mi-table">
      <h3 class="mi-chart-title">积分记录</h3>
      <el-table
        v-loading="listLoading"
        :data="list"
        size="small"
        :empty-text="loadError || '暂无数据'"
      >
        <el-table-column prop="createDate" label="创建时间" width="150" />
        <el-table-column label="会员" min-width="180">
          <template #default="{ row }">
            <div class="mi-member">
              <span class="mi-name">{{ row.memberName || '—' }}</span>
              <span class="mi-meta">{{ row.memberPhone }} · {{ row.centerMemberId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邀请码 / 上级" min-width="170">
          <template #default="{ row }">
            <div class="mi-member">
              <span>{{ row.inviteCode || '—' }}</span>
              <span class="mi-meta">上级：{{ row.parentInviteCode || '—' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="积分变动" width="110" align="right">
          <template #default="{ row }">
            <span :class="row.consumptionIntegral >= 0 ? 'amt-in' : 'amt-out'">
              {{ fmtNum(row.consumptionIntegral) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="积分类型" width="105">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.integralTypeLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ row.stateLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="orderCode" label="关联订单号" min-width="170" show-overflow-tooltip />
        <el-table-column label="历史价格" width="110" align="right">
          <template #default="{ row }">{{ fmtNum(row.historyPrice) }}</template>
        </el-table-column>
        <el-table-column prop="remarks" label="备注" min-width="180" show-overflow-tooltip />
      </el-table>
      <div class="mi-pager">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="changePage"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import MetricTile from '../components/MetricTile.vue';
import ChartPanel from '../components/ChartPanel.vue';
import { useMemberIntegralRecords } from '../features/member-integral/useMemberIntegralRecords';
import { useRoleStore } from '../stores/role';

const typeOptions = [
  { value: '1', label: '购买奖励' },
  { value: '3', label: '订单消费' },
  { value: '4', label: '退款回滚' },
  { value: '5', label: '分享奖励' },
  { value: '6', label: '人员操作' },
  { value: '7', label: '签到' },
  { value: '8', label: '评价奖励' },
  { value: '10', label: '推荐' },
  { value: '12', label: '兑换福利金' }
];
const stateOptions = [
  { value: '1', label: '充值' },
  { value: '2', label: '消费' }
];

const fmtNum = (n?: number | null) =>
  n == null
    ? '—'
    : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n?: number) => (n ?? 0).toLocaleString('zh-CN');

const {
  phone,
  integralType,
  state,
  keyword,
  dateRange,
  page,
  pageSize,
  total,
  changePage,
  summary,
  list,
  loading,
  listLoading,
  syncing,
  loadError,
  applyFilters,
  resetFilters,
  reload,
  exportCsv,
  trendOption,
  typeOption,
  stateOption,
  topMembersOption
} = useMemberIntegralRecords();

const roleStore = useRoleStore();
const canRefresh = computed(() => roleStore.permissions.includes('analytics:refresh'));
const canExport = computed(() => roleStore.permissions.includes('analytics:export'));
const netNegative = computed(() => (summary.value?.kpis.netChange ?? 0) < 0);
</script>

<style src="../styles/views/member-integral.css" scoped></style>

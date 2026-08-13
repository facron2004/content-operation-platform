<template>
  <section v-loading="loading || syncing" class="page-stack welfare-points">
    <div class="page-toolbar">
      <el-button v-if="canRefresh" :loading="syncing" @click="reload(true)">
        同步福利金数据
      </el-button>
      <el-button v-if="canExport" type="primary" @click="exportCsv">导出 CSV</el-button>
    </div>

    <ErrorAlert :message="loadError" />

    <!-- KPI -->
    <div class="wp-kpi-row">
      <MetricTile label="记录数" :value="fmtInt(summary?.kpis.totalRecords)" />
      <MetricTile label="总充值" :value="fmtYuan(summary?.kpis.totalRecharge)" info />
      <MetricTile label="总消费" :value="fmtYuan(summary?.kpis.totalConsume)" danger />
      <MetricTile label="净变动" :value="fmtYuan(summary?.kpis.netChange)" :danger="netNegative" />
      <MetricTile label="参与会员" :value="fmtInt(summary?.kpis.memberCount)" />
      <MetricTile label="当前总余额" :value="fmtYuan(summary?.kpis.currentBalanceSum)" />
    </div>

    <!-- Filters -->
    <div class="wp-filters panel">
      <el-input v-model="phone" placeholder="手机号 / 推荐码" clearable style="width: 180px" />
      <el-select v-model="pointType" placeholder="变动类型" clearable style="width: 130px">
        <el-option label="充值" value="1" />
        <el-option label="消费" value="2" />
      </el-select>
      <el-select v-model="sourceType" placeholder="来源" clearable style="width: 150px">
        <el-option v-for="o in sourceOptions" :key="o.value" :label="o.label" :value="o.value" />
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
        placeholder="关键词(描述/订单号)"
        clearable
        style="width: 200px"
      />
      <el-button type="primary" @click="applyFilters">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <!-- Charts -->
    <div class="wp-charts">
      <div class="panel wp-chart wp-chart-wide">
        <h3 class="wp-chart-title">每日趋势（充值 / 消费）</h3>
        <ChartPanel :option="trendOption" />
      </div>
      <div class="panel wp-chart">
        <h3 class="wp-chart-title">变动类型分布</h3>
        <ChartPanel :option="typeOption" />
      </div>
      <div class="panel wp-chart">
        <h3 class="wp-chart-title">来源分布</h3>
        <ChartPanel :option="sourceOption" />
      </div>
      <div class="panel wp-chart wp-chart-wide">
        <h3 class="wp-chart-title">Top 会员（按净变动）</h3>
        <ChartPanel :option="topMembersOption" />
      </div>
    </div>

    <!-- Table -->
    <div class="panel wp-table">
      <h3 class="wp-chart-title">福利金记录</h3>
      <el-table
        v-loading="listLoading"
        :data="list"
        size="small"
        :empty-text="loadError || '暂无数据'"
      >
        <el-table-column prop="createDate" label="创建时间" width="150" />
        <el-table-column label="会员" min-width="180">
          <template #default="{ row }">
            <div class="wp-member">
              <span class="wp-name">{{ row.memberName || '—' }}</span>
              <span class="wp-meta">{{ row.memberPhone }} · {{ row.memberCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="变动类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.pointType === 1 ? 'primary' : 'danger'" size="small">
              {{ row.pointTypeLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceTypeLabel" label="来源" width="110" />
        <el-table-column label="变动金额" width="110" align="right">
          <template #default="{ row }">
            <span :class="row.pointType === 1 ? 'amt-in' : 'amt-out'">
              {{ fmtYuan(row.pointAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="当前余额" width="110" align="right">
          <template #default="{ row }">{{ fmtYuan(row.currentBalance) }}</template>
        </el-table-column>
        <el-table-column prop="orderNo" label="关联订单号" width="170" />
        <el-table-column prop="changeDesc" label="变更描述" min-width="200" show-overflow-tooltip />
      </el-table>
      <div class="wp-pager">
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
import { useWelfarePoints } from '../features/welfare-points/composables/useWelfarePoints';
import { useRoleStore } from '../stores/role';

const sourceOptions = [
  { value: '1', label: '订单收益' },
  { value: '2', label: '系统发放' },
  { value: '3', label: '活动收益' },
  { value: '4', label: '交易退款' },
  { value: '5', label: '其他' },
  { value: '-1', label: '过期清零' },
  { value: '-2', label: '兑换消费' },
  { value: '-3', label: '系统扣除' }
];

const fmtYuan = (n?: number) =>
  (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n?: number) => (n ?? 0).toLocaleString('zh-CN');

const {
  phone,
  pointType,
  sourceType,
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
  sourceOption,
  topMembersOption
} = useWelfarePoints();

const roleStore = useRoleStore();
const canRefresh = computed(() => roleStore.permissions.includes('analytics:refresh'));
const canExport = computed(() => roleStore.permissions.includes('analytics:export'));
const netNegative = computed(() => (summary.value?.kpis.netChange ?? 0) < 0);
</script>

<style src="../styles/views/welfare-points.css" scoped></style>

<template>
  <section class="panel top-offenders">
    <header>
      <h3>Top商家GMV</h3>
      <div class="top-header-controls">
        <el-select size="small" class="top-area-select" disabled>
          <el-option label="全部商圈" value="" />
        </el-select>
        <a class="top-more" href="javascript:void(0)">查看全部 ›</a>
      </div>
    </header>

    <!-- Residual #265: ranking head is capped at GMV_TOP_MERCHANTS_LIMIT. -->
    <p v-if="truncated" class="ranking-cap-hint">
      排行仅加载前 {{ limitLabel }} 家商家；分页在该上限内切换。
    </p>

    <div class="top-table-wrap">
      <table v-if="topMerchants.length > 0" class="top-table">
        <thead>
          <tr>
            <th class="col-rank">排名</th>
            <th class="col-name">商家</th>
            <th class="col-area">区域</th>
            <th class="col-gmv">GMV（元）</th>
            <th class="col-delta">较昨日</th>
            <th class="col-orders">订单数（单）</th>
            <th class="col-refund">退款金额（元）</th>
            <th class="col-verify">核销率</th>
            <th class="col-aov">客单价（元）</th>
            <th class="col-trend">趋势</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(m, idx) in visibleMerchants" :key="m.merchantName + idx">
            <td class="col-rank">{{ page > 1 ? (page - 1) * pageSize + idx + 1 : idx + 1 }}</td>
            <td class="col-name">
              <span class="merchant-name">{{ m.merchantName }}</span>
            </td>
            <td class="col-area">{{ m.areaName || '—' }}</td>
            <td class="col-gmv">{{ displayMoney(m, 'gmv') }}</td>
            <td class="col-delta" :class="deltaClass(m)">
              {{ deltaText(m) }}
            </td>
            <td class="col-orders">{{ formatCount(m.paidOrderCount) }}</td>
            <td class="col-refund">{{ displayMoney(m, 'gmvRefund') }}</td>
            <td class="col-verify">{{ formatPercent(m.verifyRate) }}</td>
            <td class="col-aov">{{ displayMoney(m, 'avgOrderValue') }}</td>
            <td class="col-trend">
              <svg viewBox="0 0 40 16" class="mini-spark" :class="sparkClass(m)">
                <path
                  :d="sparkPathFor(idx)"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else title="暂无商家数据" description="订单同步后自动生成商家排行" />
    </div>

    <!-- Residual #230: page/hasMore -->
    <div class="pager">
      <AppleButton size="sm" variant="secondary" :disabled="page <= 1" @click="$emit('prev')">
        上一页
      </AppleButton>
      <span class="pager-meta">第 {{ page }} 页</span>
      <AppleButton size="sm" variant="secondary" :disabled="!hasMore" @click="$emit('next')">
        下一页
      </AppleButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppleButton from '../../../components/AppleButton.vue';
import EmptyState from '../../../components/EmptyState.vue';
import { displayMoney, formatCount, formatPercent } from '../../../utils/format';

const props = withDefaults(
  defineProps<{
    topMerchants: Array<{
      merchantName: string;
      areaName?: string | null;
      gmv: number;
      gmvRefund: number;
      gmvVerify: number;
      refundRate: number;
      verifyRate: number;
      paidOrderCount: number;
      avgOrderValue?: number;
    }>;
    merchantSort: string;
    page: number;
    hasMore: boolean;
    truncated?: boolean;
    limit?: number | null;
    pageSize?: number;
  }>(),
  {
    truncated: false,
    limit: null,
    pageSize: 5
  }
);

defineEmits<{
  (e: 'update:merchantSort', value: string): void;
  (e: 'change'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();

const visibleMerchants = computed(() => props.topMerchants.slice(0, props.pageSize));

const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 1000
);

function deltaClass(m: { verifyRate: number }): string {
  if (m.verifyRate >= 0.6) return 'delta-up';
  if (m.verifyRate >= 0.4) return 'delta-flat';
  return 'delta-down';
}

function deltaText(m: { verifyRate: number }): string {
  const pct = ((m.verifyRate - 0.5) * 50).toFixed(2);
  const sign = m.verifyRate >= 0.5 ? '+' : '';
  return `${sign}${pct}%`;
}

function sparkClass(m: { verifyRate: number }): string {
  if (m.verifyRate >= 0.6) return 'spark-up';
  if (m.verifyRate >= 0.4) return 'spark-flat';
  return 'spark-down';
}

/** Deterministic spark path based on index for visual variety */
function sparkPathFor(idx: number): string {
  const seeds = [
    'M0,12 Q8,6 14,10 T28,5 T40,7',
    'M0,8 Q10,12 18,6 T30,10 T40,4',
    'M0,10 Q8,8 16,12 T26,6 T40,9',
    'M0,14 Q10,8 20,11 T32,6 T40,8'
  ];
  return seeds[idx % seeds.length] || seeds[0];
}
</script>

<style scoped>
.top-offenders {
  padding: 18px 20px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top-offenders header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.top-offenders header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.top-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.top-area-select {
  width: 110px;
}

.top-more {
  color: #667085;
  font-size: 12px;
  text-decoration: none;
}
.top-more:hover {
  color: #2e90fa;
}

.ranking-cap-hint {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  color: #92400e;
  font-size: 12px;
  line-height: 1.5;
}

.top-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.top-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.top-table th {
  text-align: left;
  padding: 8px 10px;
  color: #98a2b3;
  font-weight: 600;
  font-size: 11px;
  border-bottom: 1px solid #f0f1f3;
  white-space: nowrap;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}

.top-table td {
  padding: 10px;
  border-bottom: 1px solid #f7f8fa;
  color: #344054;
  vertical-align: middle;
  white-space: nowrap;
}

.top-table tbody tr:hover td {
  background: #fafbfc;
}

.col-rank {
  width: 42px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.col-name {
  min-width: 120px;
}
.merchant-name {
  font-weight: 600;
  color: #101828;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

.col-area {
  width: 70px;
  color: #667085;
}

.col-gmv {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #101828;
  width: 90px;
}

.col-delta {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  width: 62px;
}
.delta-up {
  color: #12b76a;
}
.delta-down {
  color: #f04438;
}
.delta-flat {
  color: #98a2b3;
}

.col-orders {
  text-align: right;
  font-variant-numeric: tabular-nums;
  width: 64px;
}

.col-refund {
  text-align: right;
  font-variant-numeric: tabular-nums;
  width: 88px;
}

.col-verify {
  text-align: right;
  font-variant-numeric: tabular-nums;
  width: 56px;
}

.col-aov {
  text-align: right;
  font-variant-numeric: tabular-nums;
  width: 80px;
}

.col-trend {
  width: 50px;
  text-align: center;
}

.mini-spark {
  width: 40px;
  height: 16px;
  display: inline-block;
}

.spark-up {
  color: #12b76a;
  opacity: 0.75;
}
.spark-down {
  color: #f04438;
  opacity: 0.75;
}
.spark-flat {
  color: #98a2b3;
  opacity: 0.6;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}

.pager-meta {
  font-size: 12px;
  color: #6e6e73;
}
</style>

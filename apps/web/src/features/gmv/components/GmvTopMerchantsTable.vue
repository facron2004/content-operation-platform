<template>
  <section class="panel top-offenders">
    <header>
      <h3>商家净 GMV 排行（所选经营日）</h3>
      <el-radio-group
        :model-value="merchantSort"
        size="small"
        class="proto-segment top-sort-segment"
        aria-label="商家排行方式"
        @change="onSortChange"
      >
        <el-radio-button value="gmvDesc">净 GMV</el-radio-button>
        <el-radio-button value="orderDesc">订单数</el-radio-button>
        <el-radio-button value="refundDesc">退款</el-radio-button>
        <el-radio-button value="verifyDesc">核销</el-radio-button>
      </el-radio-group>
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
            <th class="col-gmv">净 GMV（元）</th>
            <th class="col-orders">支付订单数（单）</th>
            <th class="col-refund">退款金额（元）</th>
            <th class="col-refund">退款率</th>
            <th class="col-verify">核销率</th>
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
            <td class="col-orders">{{ formatCount(m.paidOrderCount) }}</td>
            <td class="col-refund">{{ displayMoney(m, 'gmvRefund') }}</td>
            <td class="col-refund">{{ formatPercent(m.refundRate) }}</td>
            <td class="col-verify">{{ formatPercent(m.verifyRate) }}</td>
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
import type { GmvMerchantRow } from '../../../services/api/gmv.api';

const props = withDefaults(
  defineProps<{
    topMerchants: GmvMerchantRow[];
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

const emit = defineEmits<{
  (e: 'update:merchantSort', value: string): void;
  (e: 'change'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();

function onSortChange(value: string | number | boolean | undefined) {
  emit('update:merchantSort', String(value));
  emit('change');
}

// Render all loaded merchants — the outer scroll container confines height,
// so users scroll within the card instead of paginating 5 at a time.
const visibleMerchants = computed(() => props.topMerchants);

const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 1000
);
</script>

<style scoped src="../../../styles/components/gmv-top-merchants-table.css"></style>

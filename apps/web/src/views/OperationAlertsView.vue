<template>
  <section v-loading="loading" class="page-stack operation-alerts-page">
    <div class="page-toolbar">
      <AppleDatePicker
        :model-value="kpiDate"
        placeholder="选择经营日"
        :disabled-date="disableFutureDate"
        @update:model-value="onDateChange"
      />
      <AppleButton variant="secondary" size="sm" :loading="loading" @click="load(true)">
        重新加载本地数据
      </AppleButton>
    </div>

    <ErrorAlert :message="loadError" />

    <div class="alert-rule-note">
      <strong>判定规则</strong>
      <span>退款率 ≥ 5%</span>
      <span>核销率 &lt; 50%</span>
      <span>支付订单数 ≥ 3</span>
      <span class="alert-rule-note__hint">数据来源：GMV 商家聚合 + 当日 KPI</span>
    </div>

    <p v-if="merchantTruncated" class="alert-coverage-note">
      本页仅扫描净 GMV 前 {{ merchantLimit ?? merchants.length }} 个商家；更低净 GMV
      商家可能未纳入预警结果。
    </p>

    <div class="alert-summary-grid">
      <article class="alert-summary-card alert-summary-card--danger">
        <span>高退款率商家</span>
        <strong>{{ refundAlerts.length }}</strong>
        <small>达到退款率阈值</small>
      </article>
      <article class="alert-summary-card alert-summary-card--warning">
        <span>低核销率商家</span>
        <strong>{{ verifyAlerts.length }}</strong>
        <small>低于核销率阈值</small>
      </article>
      <article class="alert-summary-card">
        <span>待处理信号</span>
        <strong>{{ alerts.length + globalAlerts.length }}</strong>
        <small>商家与全平台合计</small>
      </article>
      <article class="alert-summary-card">
        <span>全平台退款 / 核销</span>
        <strong>
          {{
            kpi
              ? `${(kpi.refundRate * 100).toFixed(2)}% / ${(kpi.verifyRate * 100).toFixed(2)}%`
              : '—'
          }}
        </strong>
        <small>退款率 / 核销率</small>
      </article>
    </div>

    <section v-if="globalAlerts.length" class="alerts-panel">
      <header class="alerts-panel-header">
        <div>
          <h2>全平台信号</h2>
          <p>先看整体指标，再下钻到商家明细。</p>
        </div>
      </header>
      <div class="global-alert-list">
        <article
          v-for="item in globalAlerts"
          :key="item.id"
          class="global-alert"
          :class="`is-${item.level}`"
        >
          <span class="global-alert__dot" aria-hidden="true" />
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="alerts-panel">
      <header class="alerts-panel-header">
        <div>
          <h2>商家预警清单</h2>
          <p>每条记录都对应一个商家和一个可执行的排查方向。</p>
        </div>
        <span class="alerts-count">已扫描 {{ merchants.length }} 个商家</span>
      </header>

      <el-table v-if="alerts.length" :data="alerts" stripe class="alerts-table">
        <el-table-column label="信号" width="130">
          <template #default="{ row }">
            <span class="alert-tag" :class="`is-${row.level}`">
              {{ row.title }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="商家" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.merchantName }}</strong>
            <small>{{ row.areaName || '未分区' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="净 GMV" min-width="140" align="right">
          <template #default="{ row }">{{ row.gmvDisplay }}</template>
        </el-table-column>
        <el-table-column label="支付订单" min-width="110" align="right">
          <template #default="{ row }">{{ row.paidOrderCount.toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column label="指标值" min-width="110" align="right">
          <template #default="{ row }">{{ formatPercent(row.rate) }}</template>
        </el-table-column>
        <el-table-column label="建议动作" min-width="260">
          <template #default="{ row }">{{ row.action }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="当前经营日暂无达到阈值的经营预警" />
    </section>
  </section>
</template>

<script setup lang="ts">
import AppleButton from '../components/AppleButton.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleDatePicker from '../features/gmv/components/AppleDatePicker.vue';
import { useOperationAlerts } from '../features/operation-alerts/useOperationAlerts';
import { formatPercent } from '../utils/format';

const {
  kpiDate,
  loading,
  loadError,
  kpi,
  merchants,
  merchantTruncated,
  merchantLimit,
  alerts,
  refundAlerts,
  verifyAlerts,
  globalAlerts,
  onDateChange,
  disableFutureDate,
  load
} = useOperationAlerts();
</script>

<style src="../styles/views/operation-alerts.css" scoped></style>

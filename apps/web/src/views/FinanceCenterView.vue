<template>
  <section v-loading="loading" class="page-stack finance-center-view">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <ErrorAlert :message="error" />

    <section class="panel finance-center-filter-panel">
      <div class="section-heading section-heading--compact">
        <div>
          <p class="eyebrow">BUSINESS PERIOD</p>
          <h2>经营期间</h2>
        </div>
        <span class="section-meta">支付与退款按业务时间统计</span>
      </div>
      <div class="finance-center-toolbar">
        <el-date-picker
          v-model="dateFrom"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          clearable
        />
        <span class="date-separator">至</span>
        <el-date-picker
          v-model="dateTo"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          clearable
        />
        <el-input
          v-model="keyword"
          clearable
          placeholder="订单号、用户或商家"
          @keyup.enter="applyFilters"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="eventType" placeholder="流水类型" @change="applyFilters">
          <el-option label="全部流水" value="all" />
          <el-option label="支付" value="payment" />
          <el-option label="退款" value="refund" />
        </el-select>
        <el-button type="primary" @click="applyFilters">查询</el-button>
      </div>
    </section>

    <div class="finance-center-metrics">
      <article class="finance-center-metric finance-center-metric--accent">
        <span>支付总额</span>
        <strong>{{ displayFen(dashboard.metrics.paidGrossFen) }}</strong>
        <small>{{ formatCount(dashboard.metrics.paidOrderCount) }} 笔已支付订单</small>
      </article>
      <article class="finance-center-metric">
        <span>退款金额</span>
        <strong>{{ displayFen(dashboard.metrics.refundFen) }}</strong>
        <small>{{ formatCount(dashboard.metrics.refundOrderCount) }} 笔退款事件</small>
      </article>
      <article class="finance-center-metric">
        <span>核销金额基数</span>
        <strong>{{ displayFen(dashboard.metrics.verifiedFen) }}</strong>
        <small>{{ formatCount(dashboard.metrics.verifiedOrderCount) }} 笔已核销订单</small>
      </article>
      <article class="finance-center-metric">
        <span>用户钱包资产</span>
        <strong>{{ displayFen(dashboard.metrics.walletAssetFen) }}</strong>
        <small>{{ formatCount(dashboard.metrics.memberCount) }} 个用户账户</small>
      </article>
      <article class="finance-center-metric">
        <span>用户积分资产</span>
        <strong>{{ formatCount(dashboard.metrics.pointAsset) }}</strong>
        <small>来自 Member.pointsBalance</small>
      </article>
      <article class="finance-center-metric">
        <span>待结算金额</span>
        <strong>{{ displayFen(dashboard.metrics.pendingSettlementFen) }}</strong>
        <small>待审核 / 已审核结算单</small>
      </article>
      <article class="finance-center-metric">
        <span>已结算金额</span>
        <strong>{{ displayFen(dashboard.metrics.settledFen) }}</strong>
        <small>{{ formatCount(dashboard.metrics.assetAccountCount) }} 个资产账户</small>
      </article>
      <article class="finance-center-metric">
        <span>对账待处理</span>
        <strong>{{ formatCount(dashboard.metrics.openReconciliationDiffCount) }}</strong>
        <small>分账失败 {{ formatCount(dashboard.metrics.failedProfitSharingCount) }} 笔</small>
      </article>
    </div>

    <div class="finance-center-content">
      <section class="panel finance-center-ledger-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">ORDER FINANCIAL EVENTS</p>
            <h2>资金流水</h2>
          </div>
          <span class="section-meta">共 {{ formatCount(pagination.total) }} 条事件</span>
        </div>

        <el-table :data="ledgerItems" row-key="eventId">
          <el-table-column label="时间" width="148">
            <template #default="{ row }">{{ displayDateTime(row.occurredAt) }}</template>
          </el-table-column>
          <el-table-column label="类型" width="78">
            <template #default="{ row }">
              <el-tag
                :type="row.eventType === 'refund' ? 'danger' : 'success'"
                size="small"
                effect="plain"
              >
                {{ eventLabel(row.eventType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="订单 / 商家" min-width="190">
            <template #default="{ row }">
              <div class="finance-event-cell">
                <strong>{{ row.orderCode || row.orderId }}</strong>
                <small>{{ row.merchantName || '未标注商家' }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="变动金额" width="132" align="right">
            <template #default="{ row }">
              <strong :class="row.eventType === 'refund' ? 'finance-negative' : 'finance-positive'">
                {{ displayFen(row.changeAmountFen) }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">{{ statusLabel(row.status) }}</template>
          </el-table-column>
        </el-table>
        <el-empty
          v-if="!loading && !ledgerItems.length"
          description="暂无资金事件"
          :image-size="54"
        />
        <div v-if="pagination.total > pagination.pageSize" class="finance-center-pagination">
          <el-pagination
            :current-page="pagination.page"
            :page-size="pagination.pageSize"
            :total="pagination.total"
            layout="prev, pager, next"
            @current-change="setPage"
          />
        </div>
      </section>

      <aside class="finance-center-side">
        <section class="panel finance-side-panel">
          <div class="section-heading section-heading--compact">
            <div>
              <p class="eyebrow">PAYMENT MIX</p>
              <h2>支付字段观测</h2>
            </div>
            <span class="section-meta">不可直接相加</span>
          </div>
          <div class="finance-channel-list">
            <div>
              <span>在线支付</span>
              <strong>{{ displayFen(dashboard.channels.onlineFen) }}</strong>
            </div>
            <div>
              <span>钱包支付</span>
              <strong>{{ displayFen(dashboard.channels.walletFen) }}</strong>
            </div>
            <div>
              <span>积分字段</span>
              <strong>{{ displayFen(dashboard.channels.bonusFen) }}</strong>
            </div>
            <div>
              <span>卡券字段</span>
              <strong>{{ displayFen(dashboard.channels.cardFen) }}</strong>
            </div>
          </div>
          <p class="finance-side-note">
            在线 /
            钱包构成支付总额；积分、卡券按原始字段展示，可能与渠道字段存在来源重叠，不参与合计。
          </p>
        </section>

        <section class="panel finance-side-panel">
          <div class="section-heading section-heading--compact">
            <div>
              <p class="eyebrow">CAPABILITY STATUS</p>
              <h2>能力接入状态</h2>
            </div>
          </div>
          <div class="finance-capability-list">
            <div>
              <span>订单流水</span>
              <el-tag type="success" size="small">已接入</el-tag>
            </div>
            <div>
              <span>AssetLedger</span>
              <el-tag :type="capabilityTag(dashboard.capabilities.assetLedger)" size="small">{{ capabilityLabel(dashboard.capabilities.assetLedger) }}</el-tag>
            </div>
            <div>
              <span>商家结算</span>
              <el-tag :type="capabilityTag(dashboard.capabilities.settlement)" size="small">{{ capabilityLabel(dashboard.capabilities.settlement) }}</el-tag>
            </div>
            <div>
              <span>分账 / 外部对账</span>
              <el-tag :type="capabilityTag(dashboard.capabilities.profitSharing)" size="small">{{ capabilityLabel(dashboard.capabilities.profitSharing) }}</el-tag>
            </div>
          </div>
          <p class="finance-side-note">
            外部支付与分账仍要求真实第三方流水号；适配器未接入时不会伪造成功回执。
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useFinanceCenter } from '../features/finance-center/useFinanceCenter';

const {
  dateFrom,
  dateTo,
  keyword,
  eventType,
  loading,
  error,
  dashboard,
  ledgerItems,
  pagination,
  reload,
  applyFilters,
  setPage,
  displayFen,
  displayDateTime,
  formatCount,
  eventLabel,
  statusLabel
} = useFinanceCenter();

function capabilityLabel(value: 'ready' | 'not_connected') {
  return value === 'ready' ? '已接入' : '待接入';
}

function capabilityTag(value: 'ready' | 'not_connected'): 'success' | 'warning' {
  return value === 'ready' ? 'success' : 'warning';
}
</script>

<style src="../styles/views/finance-center.css" scoped></style>

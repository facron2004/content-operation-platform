<template>
  <section v-loading="loading" class="page-stack order-center-view">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <ErrorAlert :message="error" />
    <ErrorAlert :message="detailError" />

    <div class="order-center-metrics">
      <article class="order-center-metric">
        <span>订单总数</span>
        <strong>{{ formatCount(summary.totalOrders) }}</strong>
        <small>当前筛选范围</small>
      </article>
      <article class="order-center-metric order-center-metric--accent">
        <span>线上支付</span>
        <strong>{{ displayFen(summary.paidAmountFen) }}</strong>
        <small>{{ formatCount(summary.paidOrders) }} 笔已支付</small>
      </article>
      <article class="order-center-metric">
        <span>余额支付</span>
        <strong>{{ displayFen(summary.paidAmountWalletFen) }}</strong>
        <small>账户余额抵扣</small>
      </article>
      <article class="order-center-metric">
        <span>已核销订单</span>
        <strong>{{ formatCount(summary.verifiedOrders) }}</strong>
        <small>已完成履约回收</small>
      </article>
      <article class="order-center-metric order-center-metric--danger">
        <span>退款订单</span>
        <strong>{{ formatCount(summary.refundedOrders) }}</strong>
        <small>需结合售后流程处理</small>
      </article>
    </div>

    <div class="order-center-content">
      <section class="panel order-center-list-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">TRADE DIRECTORY</p>
            <h2>订单列表</h2>
          </div>
          <span class="section-meta">共 {{ formatCount(pagination.total) }} 单</span>
        </div>

        <div class="order-center-toolbar">
          <el-input
            v-model="search"
            clearable
            placeholder="搜索订单号、用户 ID 或商家"
            @keyup.enter="applyFilters"
          />
          <el-input
            v-model="category"
            clearable
            placeholder="商品类目（精确筛选）"
            @keyup.enter="applyFilters"
          />
          <el-select v-model="status" clearable placeholder="订单状态" @change="applyFilters">
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="已核销" value="verified" />
            <el-option label="已退款" value="refunded" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
          <el-button type="primary" @click="applyFilters">查询</el-button>
        </div>

        <el-table
          :data="items"
          row-key="orderId"
          highlight-current-row
          :current-row-key="selectedOrderId"
          @row-click="selectTableOrder"
        >
          <el-table-column label="订单" min-width="188">
            <template #default="{ row }">
              <div class="order-cell">
                <strong>{{ row.orderCode || row.orderId }}</strong>
                <small>{{ displayDateTime(row.orderTime) }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="用户" min-width="132">
            <template #default="{ row }">
              <div class="order-cell">
                <strong>{{ row.memberName || '未关联用户' }}</strong>
                <small>{{ row.memberId || '—' }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="商家 / 商品" min-width="170">
            <template #default="{ row }">
              <div class="order-cell">
                <strong>{{ row.merchantName || '未标注商家' }}</strong>
                <small>{{ row.packageName || row.packageId || '未关联商品' }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="statusType(row.status)">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="线上支付" width="118" align="right">
            <template #default="{ row }">
              {{ displayFen(row.paidAmountFen) }}
            </template>
          </el-table-column>
          <el-table-column label="余额支付" width="118" align="right">
            <template #default="{ row }">
              {{ displayFen(row.paidAmountWalletFen) }}
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && !items.length" description="暂无匹配订单" />
        <div v-if="pagination.total > pagination.pageSize" class="order-center-pagination">
          <el-pagination
            :current-page="pagination.page"
            :page-size="pagination.pageSize"
            :total="pagination.total"
            layout="prev, pager, next"
            @current-change="setPage"
          />
        </div>
      </section>

      <aside v-loading="detailLoading" class="panel order-center-detail-panel">
        <template v-if="selectedOrder">
          <div class="order-detail-header">
            <div>
              <p class="eyebrow">ORDER PROFILE</p>
              <h2>{{ selectedOrder.orderCode || selectedOrder.orderId }}</h2>
              <p>
                {{ selectedOrder.merchantName || '未标注商家' }} ·
                {{ selectedOrder.packageName || '未关联商品' }}
              </p>
            </div>
            <el-tag effect="plain" :type="statusType(selectedOrder.status)">
              {{ statusLabel(selectedOrder.status) }}
            </el-tag>
          </div>

          <div class="order-detail-money">
            <div>
              <span>订单金额</span>
              <strong>{{ displayFen(selectedOrder.orderAmountFen) }}</strong>
            </div>
            <div>
              <span>线上支付</span>
              <strong>{{ displayFen(selectedOrder.paidAmountFen) }}</strong>
            </div>
            <div>
              <span>余额支付</span>
              <strong>{{ displayFen(selectedOrder.paidAmountWalletFen) }}</strong>
            </div>
            <div>
              <span>实付合计</span>
              <strong>{{ displayFen(paidTotalFen(selectedOrder)) }}</strong>
            </div>
            <div>
              <span>核销金额</span>
              <strong>{{ displayFen(selectedOrder.verifyAmountFen) }}</strong>
            </div>
            <div>
              <span>退款金额</span>
              <strong>{{ displayFen(selectedOrder.refundAmountFen) }}</strong>
            </div>
          </div>

          <div class="order-detail-related">
            <div>
              <span>用户</span>
              <strong>{{ detail?.member?.nickname || '未关联用户' }}</strong>
              <small>{{ detail?.member?.memberId || selectedOrder.memberId || '—' }}</small>
            </div>
            <div>
              <span>商品分类</span>
              <strong>{{ detail?.package?.category || '—' }}</strong>
              <small>{{ detail?.package?.packageId || selectedOrder.packageId || '—' }}</small>
            </div>
            <div>
              <span>支付渠道</span>
              <strong>{{ selectedOrder.channel || '—' }}</strong>
              <small>数据来源：OrderHeader</small>
            </div>
          </div>

          <div class="order-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>订单节点</h3>
              <span class="section-meta">时间线</span>
            </div>
            <div class="order-timeline">
              <div class="timeline-row">
                <span class="timeline-dot timeline-dot--active" />
                <div>
                  <strong>下单</strong>
                  <small>{{ displayDateTime(selectedOrder.orderTime) }}</small>
                </div>
              </div>
              <div class="timeline-row">
                <span
                  class="timeline-dot"
                  :class="{ 'timeline-dot--active': selectedOrder.paidTime }"
                />
                <div>
                  <strong>支付</strong>
                  <small>{{ displayDateTime(selectedOrder.paidTime) }}</small>
                </div>
              </div>
              <div class="timeline-row">
                <span
                  class="timeline-dot"
                  :class="{ 'timeline-dot--active': selectedOrder.verifyTime }"
                />
                <div>
                  <strong>核销</strong>
                  <small>{{ displayDateTime(selectedOrder.verifyTime) }}</small>
                </div>
              </div>
              <div class="timeline-row">
                <span
                  class="timeline-dot"
                  :class="{ 'timeline-dot--danger': selectedOrder.refundTime }"
                />
                <div>
                  <strong>退款</strong>
                  <small>{{ displayDateTime(selectedOrder.refundTime) }}</small>
                </div>
              </div>
            </div>
          </div>

          <div
            v-loading="transactionLoading"
            class="order-detail-section order-transaction-section"
          >
            <div class="section-heading section-heading--compact">
              <h3>交易记录</h3>
              <span class="section-meta">只读展示</span>
            </div>

            <div v-if="transactions?.stateHistory.length" class="transaction-history-list">
              <div
                v-for="item in transactions.stateHistory"
                :key="item.id"
                class="transaction-history-row"
              >
                <span class="timeline-dot timeline-dot--active" />
                <div>
                  <strong>
                    {{ statusLabel(item.fromStatus || 'pending') }} →
                    {{ statusLabel(item.toStatus) }}
                  </strong>
                  <small>{{ item.reason }} · {{ displayDateTime(item.createdAt) }}</small>
                </div>
              </div>
            </div>

            <div v-if="transactions?.verifications.length" class="transaction-record-list">
              <div class="transaction-record-heading">核销记录</div>
              <div
                v-for="item in transactions.verifications"
                :key="item.id"
                class="transaction-record-row"
              >
                <div>
                  <strong>{{ displayFen(item.amountFen) }}</strong>
                  <small>{{ item.verificationNo }} · {{ displayDateTime(item.verifiedAt) }}</small>
                </div>
                <el-tag size="small" type="success" effect="plain">{{ item.status }}</el-tag>
              </div>
            </div>

            <div v-if="transactions?.refunds.length" class="transaction-record-list">
              <div class="transaction-record-heading">退款申请</div>
              <div
                v-for="item in transactions.refunds"
                :key="item.id"
                class="transaction-record-row"
              >
                <div>
                  <strong>{{ displayFen(item.refundAmountFen) }} · {{ item.refundNo }}</strong>
                  <small>{{ item.reason }} · {{ displayDateTime(item.createdAt) }}</small>
                </div>
                <el-tag size="small" effect="plain">{{ item.status }}</el-tag>
              </div>
            </div>

            <p class="transaction-capability-note">
              订单中心仅同步并展示订单、核销、退款和状态流水；不提供核销、退款或库存回补写操作。
            </p>
          </div>
        </template>
        <el-empty v-else description="选择一笔订单查看详情" />
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useOrderCenter } from '../features/order-center/useOrderCenter';
import type { OrderCenterItem } from '../services/api/order-center.api';

const {
  search,
  status,
  category,
  loading,
  detailLoading,
  transactionLoading,
  error,
  detailError,
  items,
  selectedOrderId,
  selectedOrder,
  detail,
  transactions,
  summary,
  pagination,
  reload,
  applyFilters,
  setPage,
  selectOrder,
  displayFen,
  paidTotalFen,
  displayDateTime,
  statusLabel,
  statusType
} = useOrderCenter();

const formatCount = (value: number) => value.toLocaleString('zh-CN');
const selectTableOrder = (row: OrderCenterItem) => selectOrder(row.orderId);
</script>

<style src="../styles/views/order-center.css" scoped></style>

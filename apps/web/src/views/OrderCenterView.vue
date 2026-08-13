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
        <span>支付金额</span>
        <strong>{{ displayFen(summary.paidAmountFen) }}</strong>
        <small>{{ formatCount(summary.paidOrders) }} 笔已支付</small>
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
          <el-table-column label="实付金额" width="118" align="right">
            <template #default="{ row }">
              {{ displayFen(row.paidAmountFen || row.orderAmountFen) }}
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
            <div class="order-detail-header__actions">
              <el-button
                v-if="canManageOrders && canVerify(selectedOrder.status)"
                type="primary"
                size="small"
                :loading="actionLoading"
                @click="openVerifyDialog"
              >
                核销
              </el-button>
              <el-button
                v-if="canManageOrders && canRefund(selectedOrder.status)"
                type="danger"
                plain
                size="small"
                :loading="actionLoading"
                @click="openRefundDialog"
              >
                发起退款
              </el-button>
            </div>
          </div>

          <div class="order-detail-money">
            <div>
              <span>订单金额</span>
              <strong>{{ displayFen(selectedOrder.orderAmountFen) }}</strong>
            </div>
            <div>
              <span>实付金额</span>
              <strong>{{ displayFen(selectedOrder.paidAmountFen) }}</strong>
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

          <div v-loading="transactionLoading" class="order-detail-section order-transaction-section">
            <div class="section-heading section-heading--compact">
              <h3>交易写链</h3>
              <span class="section-meta">核销 / 退款 / 审计</span>
            </div>

            <div v-if="transactions?.stateHistory.length" class="transaction-history-list">
              <div v-for="item in transactions.stateHistory" :key="item.id" class="transaction-history-row">
                <span class="timeline-dot timeline-dot--active" />
                <div>
                  <strong>{{ statusLabel(item.fromStatus || 'pending') }} → {{ statusLabel(item.toStatus) }}</strong>
                  <small>{{ item.reason }} · {{ displayDateTime(item.createdAt) }}</small>
                </div>
              </div>
            </div>

            <div v-if="transactions?.verifications.length" class="transaction-record-list">
              <div class="transaction-record-heading">核销记录</div>
              <div v-for="item in transactions.verifications" :key="item.id" class="transaction-record-row">
                <div>
                  <strong>{{ displayFen(item.amountFen) }}</strong>
                  <small>{{ item.verificationNo }} · {{ displayDateTime(item.verifiedAt) }}</small>
                </div>
                <el-tag size="small" type="success" effect="plain">{{ item.status }}</el-tag>
              </div>
            </div>

            <div v-if="transactions?.refunds.length" class="transaction-record-list">
              <div class="transaction-record-heading">退款申请</div>
              <div v-for="item in transactions.refunds" :key="item.id" class="transaction-record-row">
                <div>
                  <strong>{{ displayFen(item.refundAmountFen) }} · {{ item.refundNo }}</strong>
                  <small>{{ item.reason }} · {{ displayDateTime(item.createdAt) }}</small>
                </div>
                <div class="transaction-record-actions">
                  <el-tag size="small" effect="plain">{{ item.status }}</el-tag>
                  <el-button
                    v-if="canManageOrders && item.status === 'requested'"
                    size="small"
                    text
                    type="primary"
                    :loading="actionLoading"
                    @click="handleApproveRefund(item)"
                  >
                    审批
                  </el-button>
                  <el-button
                    v-if="canManageOrders && item.status === 'approved'"
                    size="small"
                    text
                    type="danger"
                    :loading="actionLoading"
                    @click="openCompleteRefund(item)"
                  >
                    完成退款
                  </el-button>
                </div>
              </div>
            </div>

            <p class="transaction-capability-note">
              外部支付退款通道：未接入；当前“完成退款”需要人工录入第三方流水号，库存回补仍会写入独立操作账本。
            </p>
          </div>
        </template>
        <el-empty v-else description="选择一笔订单查看详情" />
      </aside>
    </div>

    <el-dialog
      v-if="canManageOrders"
      v-model="verifyDialogVisible"
      title="订单核销"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="核销金额（分）">
          <el-input v-model="verifyForm.amountFen" placeholder="留空则核销剩余金额" />
        </el-form-item>
        <el-form-item label="核销码">
          <el-input v-model="verifyForm.verificationCode" maxlength="100" />
        </el-form-item>
        <el-form-item label="操作说明">
          <el-input v-model="verifyForm.reason" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="verifyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitVerify">确认核销</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="canManageOrders"
      v-model="refundDialogVisible"
      title="发起退款"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="退款类型">
          <el-select v-model="refundForm.refundType" style="width: 100%">
            <el-option label="全额退款" value="full" />
            <el-option label="部分退款" value="partial" />
            <el-option label="商家拒付" value="merchant_refusal" />
            <el-option label="平台补偿" value="platform_compensation" />
          </el-select>
        </el-form-item>
        <el-form-item label="退款金额（分）">
          <el-input v-model="refundForm.amountFen" placeholder="留空则退剩余可退金额" />
        </el-form-item>
        <el-form-item label="退款原因">
          <el-input v-model="refundForm.reason" type="textarea" :rows="3" maxlength="300" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="actionLoading" @click="submitRefund">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="canManageOrders"
      v-model="completeRefundDialogVisible"
      title="完成退款"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="第三方退款流水号">
          <el-input v-model="completeRefundForm.thirdPartyRefundId" maxlength="120" />
        </el-form-item>
        <el-form-item label="库存回补数量">
          <el-input-number v-model="completeRefundForm.restoreInventoryQuantity" :min="0" :max="100000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeRefundDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="actionLoading" @click="submitCompleteRefund">确认完成</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useOrderCenter } from '../features/order-center/useOrderCenter';
import { canManageOrders as resolveCanManageOrders } from '../features/write-action-permissions';
import type { OrderCenterItem, RefundRequest } from '../services/api/order-center.api';
import { useRoleStore } from '../stores/role';

const {
  search,
  status,
  loading,
  detailLoading,
  transactionLoading,
  actionLoading,
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
  verifySelectedOrder,
  requestSelectedRefund,
  approveSelectedRefund,
  completeSelectedRefund,
  displayFen,
  displayDateTime,
  statusLabel,
  statusType
} = useOrderCenter();

const roleStore = useRoleStore();
const canManageOrders = computed(() =>
  resolveCanManageOrders(roleStore.effectiveRoles, roleStore.permissions)
);

const formatCount = (value: number) => value.toLocaleString('zh-CN');
const selectTableOrder = (row: OrderCenterItem) => selectOrder(row.orderId);

const verifyDialogVisible = ref(false);
const refundDialogVisible = ref(false);
const completeRefundDialogVisible = ref(false);
const verifyForm = ref({ amountFen: '', verificationCode: '', reason: '' });
const refundForm = ref({ refundType: 'full', amountFen: '', reason: '' });
const completeRefundForm = ref({ thirdPartyRefundId: '', restoreInventoryQuantity: 0 });
const activeRefund = ref<RefundRequest | null>(null);

const canVerify = (value: string) => ['paid', 'waiting_use', 'partially_verified'].includes(value);
const canRefund = (value: string) =>
  ['paid', 'waiting_use', 'partially_verified', 'verified', 'completed', 'refunding', 'partially_refunded'].includes(value);

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '操作失败，请稍后重试';
}

function openVerifyDialog() {
  if (!canManageOrders.value) return;
  verifyDialogVisible.value = true;
}

function openRefundDialog() {
  if (!canManageOrders.value) return;
  refundDialogVisible.value = true;
}

async function submitVerify() {
  if (!canManageOrders.value) return;
  try {
    await verifySelectedOrder({
      amountFen: verifyForm.value.amountFen || undefined,
      verificationCode: verifyForm.value.verificationCode || undefined,
      reason: verifyForm.value.reason || undefined
    });
    verifyDialogVisible.value = false;
    verifyForm.value = { amountFen: '', verificationCode: '', reason: '' };
    ElMessage.success('核销已记录');
  } catch (cause) {
    ElMessage.error(messageOf(cause));
  }
}

async function submitRefund() {
  if (!canManageOrders.value) return;
  if (!refundForm.value.reason.trim()) {
    ElMessage.warning('请填写退款原因');
    return;
  }
  try {
    await requestSelectedRefund({
      refundType: refundForm.value.refundType,
      amountFen: refundForm.value.amountFen || undefined,
      reason: refundForm.value.reason.trim()
    });
    refundDialogVisible.value = false;
    refundForm.value = { refundType: 'full', amountFen: '', reason: '' };
    ElMessage.success('退款申请已提交');
  } catch (cause) {
    ElMessage.error(messageOf(cause));
  }
}

async function handleApproveRefund(refund: RefundRequest) {
  if (!canManageOrders.value) return;
  try {
    await approveSelectedRefund(refund);
    ElMessage.success('退款申请已审批');
  } catch (cause) {
    ElMessage.error(messageOf(cause));
  }
}

function openCompleteRefund(refund: RefundRequest) {
  if (!canManageOrders.value) return;
  activeRefund.value = refund;
  completeRefundForm.value = { thirdPartyRefundId: '', restoreInventoryQuantity: 0 };
  completeRefundDialogVisible.value = true;
}

async function submitCompleteRefund() {
  if (!canManageOrders.value) return;
  if (!activeRefund.value || !completeRefundForm.value.thirdPartyRefundId.trim()) {
    ElMessage.warning('请填写第三方退款流水号');
    return;
  }
  try {
    await completeSelectedRefund(activeRefund.value, {
      thirdPartyRefundId: completeRefundForm.value.thirdPartyRefundId.trim(),
      restoreInventoryQuantity: completeRefundForm.value.restoreInventoryQuantity || undefined
    });
    completeRefundDialogVisible.value = false;
    activeRefund.value = null;
    ElMessage.success('退款已完成并写入资金操作链');
  } catch (cause) {
    ElMessage.error(messageOf(cause));
  }
}
</script>

<style src="../styles/views/order-center.css" scoped></style>

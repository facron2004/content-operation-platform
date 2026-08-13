<template>
  <section v-loading="loading" class="page-stack finance-operations-view">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="loadData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <ErrorAlert :message="error" />

    <section class="panel finance-operations-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="finance-operations-nav__item"
        :class="{ 'is-active': section === item.key }"
        type="button"
        @click="go(item.path)"
      >
        <span>{{ item.label }}</span>
        <small>{{ item.note }}</small>
      </button>
    </section>

    <section v-if="isAccountSection" class="panel finance-operations-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">UNIFIED ACCOUNT</p>
          <h2>{{ pageMeta.tableTitle }}</h2>
        </div>
        <div class="finance-operations-actions">
          <span class="section-meta">共 {{ accounts.length }} 个账户</span>
          <el-button type="primary" @click="accountDialog = true">
            <el-icon><Plus /></el-icon>
            创建账户
          </el-button>
        </div>
      </div>
      <el-table :data="accounts" row-key="id">
        <el-table-column label="归属" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ ownerLabel(row.ownerType) }}</strong>
              <small>{{ row.ownerId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="资产类型" width="126">
          <template #default="{ row }">{{ assetLabel(row.assetType) }}</template>
        </el-table-column>
        <el-table-column label="余额" width="150" align="right">
          <template #default="{ row }">
            <strong>{{ displayAsset(row) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="冻结" width="130" align="right">
          <template #default="{ row }">{{ displayFen(row.frozenBalance) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'active' ? 'success' : 'info'"
              size="small"
              effect="plain"
            >
              {{ row.status === 'active' ? '正常' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近变更" width="158">
          <template #default="{ row }">{{ displayDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAdjust(row)">调整</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !accounts.length" description="暂无资产账户" :image-size="56" />
    </section>

    <section v-else-if="section === 'ledger'" class="panel finance-operations-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">APPEND-ONLY LEDGER</p>
          <h2>资产流水</h2>
        </div>
        <span class="section-meta">只追加，不覆盖历史余额快照</span>
      </div>
      <el-table :data="ledgers" row-key="id">
        <el-table-column label="时间" width="156">
          <template #default="{ row }">{{ displayDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="账户" min-width="180">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ ownerLabel(row.ownerType) }} · {{ assetLabel(row.assetType) }}</strong>
              <small>{{ row.ownerId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="业务" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ row.businessType }}</strong>
              <small>{{ row.businessId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="变更" width="132" align="right">
          <template #default="{ row }">
            <strong :class="Number(row.changeAmount) < 0 ? 'finance-negative' : 'finance-positive'">
              {{ displayFen(row.changeAmount) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="变更前 / 后" width="160" align="right">
          <template #default="{ row }">
            {{ displayFen(row.beforeBalance) }} → {{ displayFen(row.afterBalance) }}
          </template>
        </el-table-column>
        <el-table-column label="幂等请求" min-width="190">
          <template #default="{ row }">
            <code>{{ row.requestId }}</code>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !ledgers.length" description="暂无资产流水" :image-size="56" />
    </section>

    <section v-else-if="section === 'settlements'" class="panel finance-operations-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">MERCHANT SETTLEMENT</p>
          <h2>{{ settlementDetail ? '结算单详情' : '商家结算' }}</h2>
        </div>
        <div class="finance-operations-actions">
          <span class="section-meta">已核销 → 待审核 → 已付款</span>
          <el-button type="primary" @click="settlementDialog = true">
            <el-icon><Plus /></el-icon>
            创建结算单
          </el-button>
        </div>
      </div>
      <el-alert
        v-if="settlementDetail"
        title="当前为结算单详情路由，列表保留同一结算记录用于继续审核或付款。"
        type="info"
        :closable="false"
        class="finance-operations-alert"
      />
      <el-table :data="settlements" row-key="id">
        <el-table-column label="结算单" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ row.settlementNo }}</strong>
              <small>{{ row.merchantId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="结算周期" width="190">
          <template #default="{ row }">
            {{ shortDate(row.periodStart) }} → {{ shortDate(row.periodEnd) }}
          </template>
        </el-table-column>
        <el-table-column label="核销金额" width="130" align="right">
          <template #default="{ row }">{{ displayFen(row.totalAmountFen) }}</template>
        </el-table-column>
        <el-table-column label="服务费" width="120" align="right">
          <template #default="{ row }">{{ displayFen(row.serviceFeeFen) }}</template>
        </el-table-column>
        <el-table-column label="应结金额" width="130" align="right">
          <template #default="{ row }">
            <strong>{{ displayFen(row.settlementAmountFen) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <el-tag :type="settlementTag(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending_approval'"
              link
              type="primary"
              @click="approveSettlement(row)"
            >
              审核
            </el-button>
            <el-button
              v-if="row.status === 'approved'"
              link
              type="success"
              @click="paySettlement(row)"
            >
              确认付款
            </el-button>
            <el-button link @click="go(`/finance/settlements/${row.id}`)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !settlements.length" description="暂无结算单" :image-size="56" />
    </section>

    <section v-else-if="section === 'profit-sharing'" class="panel finance-operations-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">PROFIT SHARING</p>
          <h2>分账管理</h2>
        </div>
        <div class="finance-operations-actions">
          <span class="section-meta">第三方适配器未接入时只记录人工待处理</span>
          <el-button type="primary" @click="profitDialog = true">
            <el-icon><Plus /></el-icon>
            创建分账
          </el-button>
        </div>
      </div>
      <el-table :data="profitOrders" row-key="id">
        <el-table-column label="分账单" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ row.sharingNo }}</strong>
              <small>{{ row.orderId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ row.sharingType }}</template>
        </el-table-column>
        <el-table-column label="总金额" width="125" align="right">
          <template #default="{ row }">{{ displayFen(row.totalAmountFen) }}</template>
        </el-table-column>
        <el-table-column label="商家 / 公益" width="170" align="right">
          <template #default="{ row }">
            {{ displayFen(row.merchantAmountFen) }} / {{ displayFen(row.charityAmountFen) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="125">
          <template #default="{ row }">
            <el-tag :type="profitTag(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="失败说明" min-width="230">
          <template #default="{ row }">{{ row.failureReason || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending' || row.status === 'failed'"
              link
              type="primary"
              @click="triggerProfit(row)"
            >
              发起尝试
            </el-button>
            <el-button
              v-if="row.status === 'manual_required' || row.status === 'failed'"
              link
              type="success"
              @click="completeProfit(row)"
            >
              人工完成
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !profitOrders.length"
        description="暂无分账记录"
        :image-size="56"
      />
    </section>

    <section v-else class="panel finance-operations-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">RECONCILIATION</p>
          <h2>{{ section === 'reconciliation-diffs' ? '对账差异' : '对账批次' }}</h2>
        </div>
        <div class="finance-operations-actions">
          <span class="section-meta">平台金额与渠道金额按分精度比较</span>
          <el-button
            v-if="section === 'reconciliation'"
            type="primary"
            @click="reconciliationDialog = true"
          >
            <el-icon><Plus /></el-icon>
            创建批次
          </el-button>
          <el-button v-else @click="go('/finance/reconciliation')">返回批次</el-button>
        </div>
      </div>
      <el-table v-if="section === 'reconciliation'" :data="reconciliationBatches" row-key="id">
        <el-table-column label="批次" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ row.batchNo }}</strong>
              <small>{{ row.channel }} · {{ row.businessDate }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总记录" width="100" align="right">
          <template #default="{ row }">{{ row.totalRecords }}</template>
        </el-table-column>
        <el-table-column label="已匹配" width="100" align="right">
          <template #default="{ row }">{{ row.matchedRecords }}</template>
        </el-table-column>
        <el-table-column label="差异" width="100" align="right">
          <template #default="{ row }">
            <strong :class="row.diffRecords ? 'finance-negative' : 'finance-positive'">
              {{ row.diffRecords }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'matched'
                  ? 'success'
                  : row.status === 'resolved'
                    ? 'info'
                    : 'warning'
              "
              size="small"
            >
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="go(`/finance/reconciliation/diffs?batchId=${encodeURIComponent(row.id)}`)"
            >
              查看差异
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-table v-else :data="reconciliationDiffs" row-key="id">
        <el-table-column label="业务" min-width="190">
          <template #default="{ row }">
            <div class="finance-primary-cell">
              <strong>{{ row.businessType }}</strong>
              <small>{{ row.businessId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="平台 / 渠道" width="170" align="right">
          <template #default="{ row }">
            {{ displayFen(row.platformAmountFen) }} / {{ displayFen(row.channelAmountFen) }}
          </template>
        </el-table-column>
        <el-table-column label="差异" width="120" align="right">
          <template #default="{ row }">
            <strong class="finance-negative">{{ displayFen(row.diffAmountFen) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="差异类型" width="120">
          <template #default="{ row }">{{ row.diffType }}</template>
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }">
            <el-tag :type="row.status === 'resolved' ? 'success' : 'warning'" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="190">
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.status === 'open'" link type="primary" @click="resolveDiff(row)">
              标记解决
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="
          !loading &&
          (section === 'reconciliation'
            ? !reconciliationBatches.length
            : !reconciliationDiffs.length)
        "
        :description="section === 'reconciliation' ? '暂无对账批次' : '暂无对账差异'"
        :image-size="56"
      />
    </section>

    <el-dialog v-model="accountDialog" title="创建资产账户" width="430px">
      <el-form label-width="92px">
        <el-form-item label="归属类型">
          <el-select v-model="accountForm.ownerType">
            <el-option label="用户" value="USER" />
            <el-option label="商家" value="MERCHANT" />
            <el-option label="平台" value="PLATFORM" />
            <el-option label="公益组织" value="CHARITY" />
          </el-select>
        </el-form-item>
        <el-form-item label="归属 ID">
          <el-input v-model="accountForm.ownerId" placeholder="用户 / 商家 / 平台 ID" />
        </el-form-item>
        <el-form-item label="资产类型">
          <el-select v-model="accountForm.assetType">
            <el-option
              v-for="item in assetOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitAccount">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustDialog" title="调整资产账户" width="470px">
      <el-alert
        title="调整会生成一条不可覆盖的 AssetLedger，并按幂等键防止重复入账。"
        type="warning"
        :closable="false"
        class="finance-dialog-alert"
      />
      <el-form label-width="100px" class="finance-dialog-form">
        <el-form-item label="变更类型">
          <el-select v-model="adjustForm.changeType">
            <el-option label="入账" value="credit" />
            <el-option label="出账" value="debit" />
            <el-option label="冻结" value="freeze" />
            <el-option label="解冻" value="unfreeze" />
            <el-option label="手工变更" value="manual" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更金额(分)">
          <el-input v-model="adjustForm.changeAmountFen" />
        </el-form-item>
        <el-form-item label="业务类型"><el-input v-model="adjustForm.businessType" /></el-form-item>
        <el-form-item label="业务 ID"><el-input v-model="adjustForm.businessId" /></el-form-item>
        <el-form-item label="备注">
          <el-input v-model="adjustForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settlementDialog" title="创建商家结算" width="470px">
      <el-form label-width="110px">
        <el-form-item label="商家 ID">
          <el-input v-model="settlementForm.merchantId" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-input v-model="settlementForm.periodStart" placeholder="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-input v-model="settlementForm.periodEnd" placeholder="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="服务费(BPS)">
          <el-input-number v-model="settlementForm.serviceFeeRateBps" :min="0" :max="10000" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="settlementForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settlementDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitSettlement">
          生成结算单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="profitDialog" title="创建分账记录" width="470px">
      <el-form label-width="110px">
        <el-form-item label="订单 ID"><el-input v-model="profitForm.orderId" /></el-form-item>
        <el-form-item label="分账类型">
          <el-input v-model="profitForm.sharingType" placeholder="package / charity" />
        </el-form-item>
        <el-form-item label="商家比例(BPS)">
          <el-input-number v-model="profitForm.merchantRateBps" :min="0" :max="10000" />
        </el-form-item>
        <el-form-item label="公益比例(BPS)">
          <el-input-number v-model="profitForm.charityRateBps" :min="0" :max="10000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profitDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitProfit">创建记录</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reconciliationDialog" title="创建对账批次" width="500px">
      <el-form label-width="110px">
        <el-form-item label="渠道">
          <el-input v-model="reconciliationForm.channel" placeholder="微信支付 / 其他渠道" />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-input v-model="reconciliationForm.businessDate" placeholder="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="总记录数">
          <el-input-number v-model="reconciliationForm.totalRecords" :min="0" />
        </el-form-item>
        <el-form-item label="已匹配数">
          <el-input-number v-model="reconciliationForm.matchedRecords" :min="0" />
        </el-form-item>
        <el-form-item label="差异记录">
          <el-switch v-model="reconciliationForm.hasDiff" active-text="录入一条差异" />
        </el-form-item>
        <template v-if="reconciliationForm.hasDiff">
          <el-form-item label="业务 ID">
            <el-input v-model="reconciliationForm.businessId" />
          </el-form-item>
          <el-form-item label="平台金额(分)">
            <el-input v-model="reconciliationForm.platformAmountFen" />
          </el-form-item>
          <el-form-item label="渠道金额(分)">
            <el-input v-model="reconciliationForm.channelAmountFen" />
          </el-form-item>
          <el-form-item label="差异类型">
            <el-input v-model="reconciliationForm.diffType" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="reconciliationDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReconciliation">
          生成批次
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { buildBusinessIntentKey } from '../services/idempotency-key';
import { formatFenYuan } from '../utils/format';
import {
  adjustFinanceAccount,
  approveFinanceSettlement,
  completeProfitSharing,
  createFinanceAccount,
  createFinanceSettlement,
  createProfitSharing,
  createReconciliationBatch,
  getFinanceSettlement,
  listAssetLedger,
  listFinanceAccounts,
  listFinanceSettlements,
  listProfitSharing,
  listReconciliationBatches,
  listReconciliationDiffs,
  payFinanceSettlement,
  resolveReconciliationDiff,
  triggerProfitSharing,
  type AssetLedger,
  type FinanceAccount,
  type FinanceSettlement,
  type ProfitSharingOrder,
  type ReconciliationBatch,
  type ReconciliationDiff
} from '../services/api/finance-operations.api';

type Section =
  | 'user-assets'
  | 'merchant-accounts'
  | 'pickup-points'
  | 'ledger'
  | 'settlements'
  | 'profit-sharing'
  | 'reconciliation'
  | 'reconciliation-diffs';
type AdjustType = 'credit' | 'debit' | 'freeze' | 'unfreeze' | 'manual';

const route = useRoute();
const router = useRouter();
const ownerPath = route.path;
const section = computed<Section>(() => {
  const path = route.path;
  if (path.includes('/reconciliation/diffs')) return 'reconciliation-diffs';
  if (path.includes('/reconciliation')) return 'reconciliation';
  if (path.includes('/profit-sharing')) return 'profit-sharing';
  if (path.includes('/settlements')) return 'settlements';
  if (path.includes('/ledger')) return 'ledger';
  if (path.includes('/merchant-accounts')) return 'merchant-accounts';
  if (path.includes('/pickup-points')) return 'pickup-points';
  return 'user-assets';
});

const navItems: Array<{ key: Section; path: string; label: string; note: string }> = [
  { key: 'user-assets', path: '/finance/user-assets', label: '用户资产', note: '账户余额' },
  {
    key: 'merchant-accounts',
    path: '/finance/merchant-accounts',
    label: '商家账户',
    note: '待结算资产'
  },
  { key: 'pickup-points', path: '/finance/pickup-points', label: '提货点', note: '提货点资产' },
  { key: 'ledger', path: '/finance/ledger', label: '资产流水', note: '追加式账本' },
  { key: 'settlements', path: '/finance/settlements', label: '商家结算', note: '审核与付款' },
  { key: 'profit-sharing', path: '/finance/profit-sharing', label: '分账管理', note: '第三方适配' },
  { key: 'reconciliation', path: '/finance/reconciliation', label: '对账批次', note: '渠道核对' },
  {
    key: 'reconciliation-diffs',
    path: '/finance/reconciliation/diffs',
    label: '对账差异',
    note: '差异处理'
  }
];

const assetOptions = [
  { value: 'CASH', label: '现金' },
  { value: 'BENEFIT', label: '福利金' },
  { value: 'POINT', label: '积分' },
  { value: 'PICKUP_POINT', label: '提货点' },
  { value: 'SETTLEMENT', label: '结算款' }
];
const loading = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const accounts = ref<FinanceAccount[]>([]);
const ledgers = ref<AssetLedger[]>([]);
const settlements = ref<FinanceSettlement[]>([]);
const profitOrders = ref<ProfitSharingOrder[]>([]);
const reconciliationBatches = ref<ReconciliationBatch[]>([]);
const reconciliationDiffs = ref<ReconciliationDiff[]>([]);
const accountDialog = ref(false);
const adjustDialog = ref(false);
const settlementDialog = ref(false);
const profitDialog = ref(false);
const reconciliationDialog = ref(false);
const selectedAccountId = ref('');

const accountForm = reactive({ ownerType: 'USER', ownerId: '', assetType: 'CASH' });
const adjustForm = reactive({
  changeType: 'credit' as AdjustType,
  changeAmountFen: '0',
  businessType: 'manual_adjustment',
  businessId: '',
  remark: ''
});
const settlementForm = reactive({
  merchantId: '',
  periodStart: '',
  periodEnd: '',
  serviceFeeRateBps: 0,
  remark: ''
});
const profitForm = reactive({
  orderId: '',
  sharingType: 'package',
  merchantRateBps: 0,
  charityRateBps: 0
});
const reconciliationForm = reactive({
  channel: '',
  businessDate: '',
  totalRecords: 0,
  matchedRecords: 0,
  hasDiff: false,
  businessId: '',
  platformAmountFen: '0',
  channelAmountFen: '0',
  diffType: 'amount'
});
let loadSequence = 0;
let disposed = false;

onScopeDispose(() => {
  disposed = true;
  loadSequence += 1;
});

const isAccountSection = computed(() =>
  ['user-assets', 'merchant-accounts', 'pickup-points'].includes(section.value)
);
const settlementDetail = computed(() => Boolean(route.params.settlementId));
const pageMeta = computed(() => {
  const meta: Record<Section, { title: string; description: string; tableTitle: string }> = {
    'user-assets': {
      title: '用户资产',
      description: '统一查看用户福利金、积分与钱包账户，所有变更均落到追加式资产流水。',
      tableTitle: '用户资产账户'
    },
    'merchant-accounts': {
      title: '商家账户',
      description: '结算款进入商家账户后保留完整的入账业务号与操作人，支持后续结算追踪。',
      tableTitle: '商家资产账户'
    },
    'pickup-points': {
      title: '提货点账户',
      description: '提货点资产独立核算，避免与现金或福利资产混用。',
      tableTitle: '提货点资产账户'
    },
    ledger: {
      title: '资产流水',
      description: '每笔资产变化记录变更前、变更额、变更后与幂等请求号。',
      tableTitle: '资产流水'
    },
    settlements: {
      title: settlementDetail.value ? '结算单详情' : '商家结算',
      description: '按核销记录生成结算单，经过审核后才允许确认外部付款。',
      tableTitle: '商家结算'
    },
    'profit-sharing': {
      title: '分账管理',
      description: '按订单金额计算平台、商家与公益分账；第三方未接入时明确停留在人工待处理。',
      tableTitle: '分账记录'
    },
    reconciliation: {
      title: '对账批次',
      description: '按渠道和业务日记录平台与渠道的匹配结果，差异进入可追踪处理链。',
      tableTitle: '对账批次'
    },
    'reconciliation-diffs': {
      title: '对账差异',
      description: '以分为单位呈现差异，处理结果会回写批次状态并保留处理人和备注。',
      tableTitle: '对账差异'
    }
  };
  return meta[section.value];
});

async function loadData() {
  const sequence = ++loadSequence;
  const targetPath = route.fullPath;
  loading.value = true;
  error.value = null;
  accounts.value = [];
  ledgers.value = [];
  settlements.value = [];
  profitOrders.value = [];
  reconciliationBatches.value = [];
  reconciliationDiffs.value = [];
  const isCurrent = () =>
    !disposed && sequence === loadSequence && targetPath === route.fullPath;

  try {
    if (isAccountSection.value) {
      const result = await listFinanceAccounts({
        ownerType: section.value === 'merchant-accounts' ? 'MERCHANT' : undefined,
        assetType: section.value === 'pickup-points' ? 'PICKUP_POINT' : undefined,
        page: 1,
        pageSize: 100
      });
      if (!isCurrent()) return;
      accounts.value = result.items;
    } else if (section.value === 'ledger') {
      const result = await listAssetLedger({ page: 1, pageSize: 100 });
      if (!isCurrent()) return;
      ledgers.value = result.items;
    } else if (section.value === 'settlements') {
      const result = route.params.settlementId
        ? [await getFinanceSettlement(String(route.params.settlementId))]
        : (await listFinanceSettlements({ page: 1, pageSize: 100 })).items;
      if (!isCurrent()) return;
      settlements.value = result;
    } else if (section.value === 'profit-sharing') {
      const result = await listProfitSharing({ page: 1, pageSize: 100 });
      if (!isCurrent()) return;
      profitOrders.value = result.items;
    } else if (section.value === 'reconciliation-diffs') {
      const result = await listReconciliationDiffs({
        batchId: queryBatchId.value,
        page: 1,
        pageSize: 100
      });
      if (!isCurrent()) return;
      reconciliationDiffs.value = result.items;
    } else {
      const result = await listReconciliationBatches({ page: 1, pageSize: 100 });
      if (!isCurrent()) return;
      reconciliationBatches.value = result.items;
    }
  } catch (cause) {
    if (!isCurrent()) return;
    error.value = cause instanceof Error ? cause.message : '资金数据加载失败';
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

const queryBatchId = computed(() =>
  typeof route.query.batchId === 'string' ? route.query.batchId : undefined
);

function go(path: string) {
  const [target, queryString] = path.split('?');
  const query = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : undefined;
  void router.push({ path: target, query });
}

function openAdjust(account: FinanceAccount) {
  selectedAccountId.value = account.id;
  adjustForm.businessId = `manual-${Date.now()}`;
  adjustDialog.value = true;
}

async function submitAccount() {
  if (!accountForm.ownerId.trim()) return ElMessage.warning('请输入归属 ID');
  submitting.value = true;
  try {
    await createFinanceAccount(
      accountForm,
      buildBusinessIntentKey(
        'asset-adjustment',
        'account',
        accountForm.ownerId,
        accountForm.assetType
      )
    );
    ElMessage.success('资产账户已创建');
    accountDialog.value = false;
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '创建账户失败');
  } finally {
    submitting.value = false;
  }
}

async function submitAdjust() {
  if (!selectedAccountId.value || !adjustForm.businessId.trim())
    return ElMessage.warning('请补充业务 ID');
  submitting.value = true;
  try {
    await adjustFinanceAccount(
      selectedAccountId.value,
      { ...adjustForm },
      buildBusinessIntentKey('asset-adjustment', selectedAccountId.value, adjustForm.businessId)
    );
    ElMessage.success('资产流水已写入');
    adjustDialog.value = false;
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '资产调整失败');
  } finally {
    submitting.value = false;
  }
}

async function submitSettlement() {
  if (!settlementForm.merchantId || !settlementForm.periodStart || !settlementForm.periodEnd)
    return ElMessage.warning('请补充结算周期和商家 ID');
  submitting.value = true;
  try {
    await createFinanceSettlement(
      { ...settlementForm },
      buildBusinessIntentKey(
        'settlement',
        settlementForm.merchantId,
        settlementForm.periodStart,
        settlementForm.periodEnd
      )
    );
    ElMessage.success('结算单已生成');
    settlementDialog.value = false;
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '创建结算单失败');
  } finally {
    submitting.value = false;
  }
}

async function approveSettlement(row: FinanceSettlement) {
  try {
    await approveFinanceSettlement(
      row.id,
      '',
      buildBusinessIntentKey('settlement', row.id, 'approve')
    );
    ElMessage.success('结算单已审核');
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '审核失败');
  }
}

async function paySettlement(row: FinanceSettlement) {
  const result = await ElMessageBox.prompt(
    '请输入第三方付款流水号，系统不会伪造外部支付成功。',
    '确认付款',
    { inputPlaceholder: '第三方付款流水号' }
  ).catch(() => null);
  if (!result) return;
  try {
    await payFinanceSettlement(
      row.id,
      result.value,
      buildBusinessIntentKey('settlement', row.id, 'pay', result.value)
    );
    ElMessage.success('结算单已标记为已付款并入账');
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '付款确认失败');
  }
}

async function submitProfit() {
  if (!profitForm.orderId || !profitForm.sharingType)
    return ElMessage.warning('请补充订单 ID 和分账类型');
  submitting.value = true;
  try {
    await createProfitSharing(
      { ...profitForm },
      buildBusinessIntentKey('profit-sharing', profitForm.orderId, profitForm.sharingType)
    );
    ElMessage.success('分账记录已创建');
    profitDialog.value = false;
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '创建分账失败');
  } finally {
    submitting.value = false;
  }
}

async function triggerProfit(row: ProfitSharingOrder) {
  try {
    await triggerProfitSharing(row.id, buildBusinessIntentKey('profit-sharing', row.id, 'trigger'));
    ElMessage.warning('第三方适配器未接入，已记录为人工待处理');
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '发起分账失败');
  }
}

async function completeProfit(row: ProfitSharingOrder) {
  const result = await ElMessageBox.prompt('请输入已确认的第三方分账流水号。', '人工完成分账', {
    inputPlaceholder: '第三方交易号'
  }).catch(() => null);
  if (!result) return;
  try {
    await completeProfitSharing(
      row.id,
      result.value,
      buildBusinessIntentKey('profit-sharing', row.id, 'complete', result.value)
    );
    ElMessage.success('分账已完成并写入商家账户');
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '完成分账失败');
  }
}

async function submitReconciliation() {
  const hasDiff = reconciliationForm.hasDiff;
  const diffs = hasDiff
    ? [
        {
          businessType: 'manual',
          businessId: reconciliationForm.businessId,
          platformAmountFen: reconciliationForm.platformAmountFen,
          channelAmountFen: reconciliationForm.channelAmountFen,
          diffType: reconciliationForm.diffType
        }
      ]
    : [];
  if (!reconciliationForm.channel || !reconciliationForm.businessDate)
    return ElMessage.warning('请补充渠道和业务日期');
  if (hasDiff && !reconciliationForm.businessId) return ElMessage.warning('差异记录需要业务 ID');
  if (reconciliationForm.matchedRecords + diffs.length !== reconciliationForm.totalRecords)
    return ElMessage.warning('总记录数必须等于已匹配数与差异数之和');
  submitting.value = true;
  try {
    await createReconciliationBatch(
      { ...reconciliationForm, diffs },
      buildBusinessIntentKey(
        'reconciliation',
        reconciliationForm.channel,
        reconciliationForm.businessDate
      )
    );
    ElMessage.success('对账批次已创建');
    reconciliationDialog.value = false;
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '创建对账批次失败');
  } finally {
    submitting.value = false;
  }
}

async function resolveDiff(row: ReconciliationDiff) {
  const result = await ElMessageBox.prompt('请填写差异处理备注。', '标记差异解决', {
    inputPlaceholder: '例如：渠道补单已确认'
  }).catch(() => null);
  if (!result) return;
  try {
    await resolveReconciliationDiff(
      row.id,
      result.value,
      buildBusinessIntentKey('reconciliation', row.id, 'resolve')
    );
    ElMessage.success('差异已解决');
    await loadData();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '处理差异失败');
  }
}

function displayFen(value: string | null | undefined) {
  return formatFenYuan(value ?? '0');
}

function displayAsset(row: FinanceAccount) {
  return row.assetType === 'POINT' || row.assetType === 'PICKUP_POINT'
    ? `${row.balance} 点`
    : displayFen(row.balance);
}

function displayDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function ownerLabel(value: string) {
  return { USER: '用户', MERCHANT: '商家', PLATFORM: '平台', CHARITY: '公益' }[value] ?? value;
}

function assetLabel(value: string) {
  return (
    {
      CASH: '现金',
      BENEFIT: '福利金',
      POINT: '积分',
      PICKUP_POINT: '提货点',
      SETTLEMENT: '结算款'
    }[value] ?? value
  );
}

function statusLabel(value: string) {
  return (
    {
      pending_approval: '待审核',
      approved: '已审核',
      paid: '已付款',
      pending: '待处理',
      processing: '处理中',
      manual_required: '人工处理',
      succeeded: '已完成',
      failed: '失败',
      matched: '已匹配',
      has_diff: '有差异',
      open: '待处理',
      resolved: '已解决'
    }[value] ?? value
  );
}

function settlementTag(value: string): 'success' | 'warning' | 'info' | 'danger' {
  return value === 'paid'
    ? 'success'
    : value === 'pending_approval'
      ? 'warning'
      : value === 'failed'
        ? 'danger'
        : 'info';
}

function profitTag(value: string): 'success' | 'warning' | 'info' | 'danger' {
  return value === 'succeeded'
    ? 'success'
    : value === 'manual_required'
      ? 'warning'
      : value === 'failed'
        ? 'danger'
        : 'info';
}

watch(
  () => route.fullPath,
  () => {
    if (route.path !== ownerPath) return;
    void loadData();
  }
);
onMounted(loadData);
</script>

<style src="../styles/views/finance-operations.css" scoped></style>

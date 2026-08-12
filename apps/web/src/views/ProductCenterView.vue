<template>
  <section v-loading="loading" class="page-stack product-center-view">
    <div class="product-center-hero panel">
      <div>
        <p class="eyebrow">V2.0.1 / PRODUCT & INVENTORY</p>
        <h1>{{ pageMeta.title }}</h1>
        <p class="hero-description">
          {{ pageMeta.description }}
        </p>
      </div>
      <div class="product-center-hero__actions">
        <span class="source-pill">{{ pageMeta.source }}</span>
        <el-button :loading="loading" @click="reload">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <ErrorAlert :message="error" />
    <ErrorAlert :message="detailError" />

    <div class="product-center-metrics">
      <article class="product-center-metric">
        <span>{{ pageMeta.itemLabel }}</span>
        <strong>{{ formatCount(summary.totalSkus) }}</strong>
        <small>当前筛选范围</small>
      </article>
      <article class="product-center-metric product-center-metric--accent">
        <span>在售 SKU</span>
        <strong>{{ formatCount(summary.activeSkus) }}</strong>
        <small>仅统计销售中</small>
      </article>
      <article class="product-center-metric product-center-metric--warning">
        <span>低库存</span>
        <strong>{{ formatCount(summary.lowStockSkus) }}</strong>
        <small>库存 1–10 件</small>
      </article>
      <article class="product-center-metric product-center-metric--danger">
        <span>已售罄</span>
        <strong>{{ formatCount(summary.outOfStockSkus) }}</strong>
        <small>库存小于等于 0</small>
      </article>
    </div>

    <div class="product-center-content">
      <section class="panel product-center-list-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">PRODUCT DIRECTORY</p>
            <h2>{{ pageMeta.tableTitle }}</h2>
          </div>
          <span class="section-meta">
            余量 {{ formatCount(summary.stockLeft) }} / {{ formatCount(summary.stockTotal) }}
          </span>
        </div>

        <div class="product-center-toolbar">
          <el-input
            v-model="search"
            clearable
            placeholder="搜索商品、商家、分类或 SKU"
            @keyup.enter="applyFilters"
          />
          <el-select v-model="inventoryStatus" placeholder="库存状态" @change="applyFilters">
            <el-option label="全部库存" value="all" />
            <el-option label="库存正常" value="normal" />
            <el-option label="库存偏低" value="low" />
            <el-option label="已售罄" value="out" />
          </el-select>
          <el-button type="primary" @click="applyFilters">查询</el-button>
        </div>

        <el-table
          :data="items"
          row-key="packageId"
          highlight-current-row
          :current-row-key="selectedPackageId"
          @row-click="selectTableProduct"
        >
          <el-table-column label="商品" min-width="220">
            <template #default="{ row }">
              <div class="product-cell">
                <strong>{{ row.packageName }}</strong>
                <small>{{ row.packageId }} · {{ row.packageType }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="商家 / 分类" min-width="150">
            <template #default="{ row }">
              <div class="product-cell">
                <strong>{{ row.merchantName }}</strong>
                <small>{{ row.category }} · {{ row.areaName }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="库存" width="108" align="right">
            <template #default="{ row }">
              <strong class="stock-value">{{ row.stockLeft }} / {{ row.stockTotal }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="售价" width="114" align="right">
            <template #default="{ row }">{{ displayFen(row.salePriceFen) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="108">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="inventoryType(row.inventoryStatus)">
                {{ inventoryLabel(row.inventoryStatus) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && !items.length" description="暂无匹配商品" />
        <div v-if="pagination.total > pagination.pageSize" class="product-center-pagination">
          <el-pagination
            :current-page="pagination.page"
            :page-size="pagination.pageSize"
            :total="pagination.total"
            layout="prev, pager, next"
            @current-change="setPage"
          />
        </div>
      </section>

      <aside v-loading="detailLoading" class="panel product-center-detail-panel">
        <template v-if="selectedProduct">
          <div class="product-detail-header">
            <div>
              <p class="eyebrow">PRODUCT PROFILE</p>
              <h2>{{ selectedProduct.packageName }}</h2>
              <p>{{ selectedProduct.merchantName }} · {{ selectedProduct.category }}</p>
            </div>
            <div class="product-detail-header__actions">
              <el-tag effect="plain" :type="inventoryType(selectedProduct.inventoryStatus)">
                {{ inventoryLabel(selectedProduct.inventoryStatus) }}
              </el-tag>
              <el-button size="small" @click="openEditDialog">编辑申请</el-button>
              <el-button size="small" type="primary" @click="openInventoryDialog">
                调整库存
              </el-button>
            </div>
          </div>

          <div class="product-detail-stock">
            <div>
              <span>可用库存</span>
              <strong>{{ selectedProduct.stockLeft }}</strong>
              <small>总库存 {{ selectedProduct.stockTotal }}</small>
            </div>
            <div>
              <span>销售价</span>
              <strong>{{ displayFen(selectedProduct.salePriceFen) }}</strong>
              <small>原价 {{ displayFen(selectedProduct.originalPriceFen) }}</small>
            </div>
            <div>
              <span>商品状态</span>
              <strong>{{ selectedProduct.saleStatus || '未标注' }}</strong>
              <small>更新 {{ displayDate(selectedProduct.updatedAt) }}</small>
            </div>
          </div>

          <div class="product-detail-meta">
            <div>
              <span>商品 ID</span>
              <strong>{{ selectedProduct.packageId }}</strong>
            </div>
            <div>
              <span>商家 ID</span>
              <strong>{{ selectedProduct.merchantId }}</strong>
            </div>
            <div>
              <span>销售周期</span>
              <strong>
                {{ displayDate(selectedProduct.startTime) }} –
                {{ displayDate(selectedProduct.endTime) }}
              </strong>
            </div>
            <div>
              <span>最近快照</span>
              <strong>{{ displayDateTime(selectedProduct.lastSnapshotAt) }}</strong>
            </div>
          </div>

          <div class="product-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>商品编辑审核</h3>
              <span class="section-meta">申请 {{ detail?.changeRequests.length ?? 0 }} 条</span>
            </div>
            <div v-if="detail?.changeRequests.length" class="change-request-list">
              <div
                v-for="change in detail.changeRequests"
                :key="change.id"
                class="change-request-row"
              >
                <div>
                  <strong>{{ changeSummary(change) }}</strong>
                  <small>{{ change.reason }} · {{ displayDateTime(change.createdAt) }}</small>
                </div>
                <div class="change-request-row__actions">
                  <el-tag size="small" effect="plain" :type="changeType(change.status)">
                    {{ changeLabel(change.status) }}
                  </el-tag>
                  <template v-if="change.status === 'requested'">
                    <el-button
                      size="small"
                      text
                      type="primary"
                      :loading="actionLoading"
                      @click="approveChange(change.id)"
                    >
                      通过
                    </el-button>
                    <el-button
                      size="small"
                      text
                      type="danger"
                      :loading="actionLoading"
                      @click="rejectChange(change.id)"
                    >
                      驳回
                    </el-button>
                  </template>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无商品编辑申请" :image-size="42" />
          </div>

          <div class="product-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>库存操作流水</h3>
              <span class="section-meta">前 20 条</span>
            </div>
            <div v-if="detail?.inventoryOperations.length" class="inventory-operation-list">
              <div
                v-for="operation in detail.inventoryOperations"
                :key="operation.operationId"
                class="inventory-operation-row"
              >
                <div>
                  <strong>
                    {{ operation.quantity > 0 ? '+' : '' }}{{ operation.quantity }} 件 ·
                    {{ inventoryOperationLabel(operation.operationType) }}
                  </strong>
                  <small>
                    {{ operation.reason || '系统操作' }} ·
                    {{ displayDateTime(operation.createdAt) }}
                  </small>
                </div>
                <span>{{ operation.beforeStock }} → {{ operation.afterStock }}</span>
              </div>
            </div>
            <el-empty v-else description="暂无库存操作流水" :image-size="42" />
          </div>

          <div class="product-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>库存快照</h3>
              <span class="section-meta">最近 {{ detail?.snapshots.length ?? 0 }} 次</span>
            </div>
            <div v-if="detail?.snapshots.length" class="snapshot-list">
              <div
                v-for="snapshot in detail.snapshots"
                :key="snapshot.snapshotTime"
                class="snapshot-row"
              >
                <div>
                  <strong>{{ displayDate(snapshot.snapshotTime) }}</strong>
                  <small>
                    {{ displayDateTime(snapshot.snapshotTime) }} ·
                    {{ snapshot.paidOrderCount }} 笔支付
                  </small>
                </div>
                <div class="snapshot-row__values">
                  <strong>{{ snapshot.remainingStock }} 件</strong>
                  <small>{{ displayFen(snapshot.gmvFen) }}</small>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无库存快照" :image-size="48" />
          </div>
        </template>
        <el-empty v-else description="选择一个商品查看详情" />
      </aside>
    </div>

    <el-dialog v-model="editDialogOpen" title="提交商品编辑申请" width="520px">
      <el-form label-width="92px" @submit.prevent="submitEdit">
        <el-form-item label="商品名称">
          <el-input v-model="editForm.packageName" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="editForm.category" />
        </el-form-item>
        <el-form-item label="销售价（分）">
          <el-input v-model="editForm.salePriceFen" />
        </el-form-item>
        <el-form-item label="福利价（分）">
          <el-input v-model="editForm.welfarePriceFen" />
        </el-form-item>
        <el-form-item label="销售状态">
          <el-input v-model="editForm.saleStatus" placeholder="如 active / recycle" />
        </el-form-item>
        <el-form-item label="变更原因" required>
          <el-input v-model="editForm.reason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitEdit">提交审核</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="inventoryDialogOpen" title="调整库存" width="440px">
      <el-form label-width="92px">
        <el-form-item label="调整数量" required>
          <el-input-number v-model="inventoryForm.delta" :min="-100000" :max="100000" />
          <span class="form-hint">正数增加，负数扣减</span>
        </el-form-item>
        <el-form-item label="调整原因" required>
          <el-input v-model="inventoryForm.reason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="inventoryDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitInventory">
          确认调整
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { useRoute } from 'vue-router';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useProductCenter } from '../features/product-center/useProductCenter';
import {
  adjustProductInventory,
  approveProductEdit,
  rejectProductEdit,
  requestProductEdit,
  type ProductCenterItem,
  type ProductChangeRequest
} from '../services/api/product-center.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';

const {
  search,
  inventoryStatus,
  loading,
  detailLoading,
  error,
  detailError,
  items,
  selectedPackageId,
  selectedProduct,
  detail,
  summary,
  pagination,
  reload,
  applyFilters,
  setPage,
  selectProduct,
  displayFen,
  displayDate,
  displayDateTime,
  inventoryLabel,
  inventoryType
} = useProductCenter();

const route = useRoute();
const pageMeta = computed(() => {
  if (route.path.startsWith('/packages')) {
    return {
      title: '套餐管理',
      description: '基于 ContentPackage 查看套餐档案、可售状态与库存，不把组合套餐关系误当作普通套餐。',
      itemLabel: '套餐',
      tableTitle: '套餐库存清单',
      source: 'ContentPackage + SalesSnapshot'
    };
  }
  if (route.path.startsWith('/inventory')) {
    return {
      title: '库存中心',
      description: '按库存状态查看 ContentPackage 的可用量、库存快照与调整流水。',
      itemLabel: '库存 SKU',
      tableTitle: '库存清单',
      source: 'ContentPackage + InventoryOperation + SalesSnapshot'
    };
  }
  return {
    title: '商品列表',
    description: '统一查看商品档案、库存状态和库存快照，优先识别售罄与低库存商品。',
    itemLabel: '商品 SKU',
    tableTitle: '商品库存清单',
    source: 'ContentPackage + SalesSnapshot'
  };
});

const formatCount = (value: number) => value.toLocaleString('zh-CN');
const selectTableProduct = (row: ProductCenterItem) => selectProduct(row.packageId);

const editDialogOpen = ref(false);
const inventoryDialogOpen = ref(false);
const actionLoading = ref(false);
const editForm = reactive({
  packageName: '',
  category: '',
  salePriceFen: '',
  welfarePriceFen: '',
  saleStatus: '',
  reason: ''
});
const inventoryForm = reactive({ delta: 1, reason: '' });

function openEditDialog() {
  if (!selectedProduct.value) return;
  editForm.packageName = selectedProduct.value.packageName;
  editForm.category = selectedProduct.value.category;
  editForm.salePriceFen = selectedProduct.value.salePriceFen ?? '';
  editForm.welfarePriceFen = selectedProduct.value.welfarePriceFen ?? '';
  editForm.saleStatus = selectedProduct.value.saleStatus ?? '';
  editForm.reason = '';
  editDialogOpen.value = true;
}

function openInventoryDialog() {
  inventoryForm.delta = 1;
  inventoryForm.reason = '';
  inventoryDialogOpen.value = true;
}

async function submitEdit() {
  if (!selectedPackageId.value || !editForm.reason.trim()) {
    ElMessage.warning('请填写商品编辑原因');
    return;
  }
  actionLoading.value = true;
  try {
    await requestProductEdit(
      selectedPackageId.value,
      {
        packageName: editForm.packageName,
        category: editForm.category,
        salePriceFen: editForm.salePriceFen || undefined,
        welfarePriceFen: editForm.welfarePriceFen || undefined,
        saleStatus: editForm.saleStatus || undefined,
        reason: editForm.reason
      },
      buildBusinessIntentKey('product-edit', selectedPackageId.value, 'request', Date.now())
    );
    ElMessage.success('商品编辑申请已提交');
    editDialogOpen.value = false;
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '商品编辑申请提交失败');
  } finally {
    actionLoading.value = false;
  }
}

async function submitInventory() {
  if (!selectedPackageId.value || !inventoryForm.delta || !inventoryForm.reason.trim()) {
    ElMessage.warning('请填写非零库存调整数量和原因');
    return;
  }
  actionLoading.value = true;
  try {
    await adjustProductInventory(
      selectedPackageId.value,
      { delta: inventoryForm.delta, reason: inventoryForm.reason },
      buildBusinessIntentKey('inventory-adjustment', selectedPackageId.value, Date.now())
    );
    ElMessage.success('库存调整已写入流水');
    inventoryDialogOpen.value = false;
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '库存调整失败');
  } finally {
    actionLoading.value = false;
  }
}

async function approveChange(requestId: string) {
  try {
    await ElMessageBox.confirm('通过后会把申请字段落到商品档案，是否继续？', '审核商品编辑', {
      type: 'warning'
    });
    actionLoading.value = true;
    await approveProductEdit(
      requestId,
      undefined,
      buildBusinessIntentKey('product-edit', requestId, 'approve', Date.now())
    );
    ElMessage.success('商品编辑申请已通过');
    await reload();
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') {
      ElMessage.error(cause instanceof Error ? cause.message : '审核失败');
    }
  } finally {
    actionLoading.value = false;
  }
}

async function rejectChange(requestId: string) {
  try {
    const result = await ElMessageBox.prompt('请输入驳回原因', '驳回商品编辑', {
      inputValidator: (value) => (value?.trim() ? true : '驳回原因不能为空'),
      inputErrorMessage: '驳回原因不能为空'
    });
    actionLoading.value = true;
    await rejectProductEdit(
      requestId,
      result.value,
      buildBusinessIntentKey('product-edit', requestId, 'reject', Date.now())
    );
    ElMessage.success('商品编辑申请已驳回');
    await reload();
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') {
      ElMessage.error(cause instanceof Error ? cause.message : '驳回失败');
    }
  } finally {
    actionLoading.value = false;
  }
}

function changeSummary(change: ProductChangeRequest) {
  const labels: Record<string, string> = {
    packageName: '名称',
    category: '分类',
    salePriceFen: '售价',
    welfarePriceFen: '福利价',
    saleStatus: '状态'
  };
  return Object.entries(change.after)
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`)
    .join(' · ');
}

function changeLabel(status: string) {
  return { requested: '待审核', approved: '已通过', rejected: '已驳回' }[status] ?? status;
}

function changeType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'requested') return 'warning';
  return 'info';
}

function inventoryOperationLabel(operationType: string) {
  return { return: '退款回补', manual_adjust: '人工调整' }[operationType] ?? operationType;
}
</script>

<style src="../styles/views/product-center.css" scoped></style>

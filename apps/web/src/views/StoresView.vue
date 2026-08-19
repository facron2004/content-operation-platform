<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Plus } from '@element-plus/icons-vue';
import AppleButton from '../components/AppleButton.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createStore,
  getActiveStoreRefresh,
  getStoreRefreshStatus,
  listStoreMerchantOptions,
  listStores,
  startStoreRefresh,
  type StoreItem,
  type StoreMerchantOption,
  type StoreRefreshJob
} from '../services/api/gap-center.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';
import { canManageMerchants as resolveCanManageMerchants } from '../features/write-action-permissions';
import { useRoleStore } from '../stores/role';

const roleStore = useRoleStore();
const canManageMerchants = computed(() =>
  resolveCanManageMerchants(roleStore.effectiveRoles, roleStore.permissions)
);

const SHENZHEN_DISTRICTS = [
  '福田区',
  '罗湖区',
  '南山区',
  '盐田区',
  '宝安区',
  '龙岗区',
  '龙华区',
  '坪山区',
  '光明区'
] as const;

const loading = ref(false);
const saving = ref(false);
const refreshStarting = ref(false);
const refreshJob = ref<StoreRefreshJob | null>(null);
const error = ref<string | null>(null);
const refreshError = ref<string | null>(null);
const items = ref<StoreItem[]>([]);
const merchants = ref<StoreMerchantOption[]>([]);
const search = ref('');
const status = ref('');
const areaName = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const tableWrapRef = ref<HTMLElement | null>(null);
const createVisible = ref(false);
const form = reactive({
  merchantId: '',
  storeName: '',
  address: '',
  areaName: '',
  contactName: '',
  contactPhone: '',
  businessHours: ''
});
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshRequestId = 0;
let refreshStartedAt = 0;
let disposed = false;
const refreshing = computed(
  () =>
    refreshStarting.value ||
    refreshJob.value?.status === 'queued' ||
    refreshJob.value?.status === 'pulling'
);
const refreshStatusText = computed(() => {
  const job = refreshJob.value;
  if (!job) return '';
  if (job.status === 'queued') return '外部门店刷新任务排队中…';
  if (job.status === 'pulling')
    return `正在串行抓取：第 ${job.progress.pagesFetched}/${job.progress.totalPages || '—'} 页，已读取 ${job.progress.shopsFetched.toLocaleString('zh-CN')} 家`;
  if (job.status === 'done')
    return `外部门店已同步：${job.progress.storesPersisted.toLocaleString('zh-CN')} 家，已更新 ${job.progress.merchantsUpdated.toLocaleString('zh-CN')} 个商家坐标`;
  if (job.status === 'interrupted') return '刷新任务被服务重启中断，旧门店数据仍保留';
  return refreshError.value || job.error || '门店刷新失败，旧数据仍保留';
});

function resetForm() {
  Object.assign(form, {
    merchantId: '',
    storeName: '',
    address: '',
    areaName: '',
    contactName: '',
    contactPhone: '',
    businessHours: ''
  });
}

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const [storeData, merchantData] = await Promise.all([
      listStores({
        search: search.value.trim() || undefined,
        status: status.value || undefined,
        areaName: areaName.value || undefined,
        page: page.value,
        pageSize: pageSize.value
      }),
      listStoreMerchantOptions()
    ]);
    items.value = storeData.items;
    total.value = storeData.pagination.total;
    merchants.value = merchantData;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '门店加载失败';
  } finally {
    loading.value = false;
    await nextTick();
    if (tableWrapRef.value) tableWrapRef.value.scrollTop = 0;
  }
}

function handleSearch() {
  page.value = 1;
  void reload();
}

function handlePageChange(next: number) {
  page.value = next;
  void reload();
}

function handleSizeChange(next: number) {
  pageSize.value = next;
  page.value = 1;
  void reload();
}

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value))
);

function sourceLabel(source: string) {
  if (source === 'merchant_projection') return '商家档案';
  if (source === 'jeesite_partner_shop') return '合作店铺';
  return '门店记录';
}

function sourcePillClass(source: string) {
  if (source === 'merchant_projection') return 'store-pill--warn';
  if (source === 'jeesite_partner_shop') return 'store-pill--info';
  return 'store-pill--success';
}

function statusPillClass(status: string) {
  return status === 'active' ? 'store-pill--success' : 'store-pill--muted';
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

async function pollRefreshJob(jobId: string, requestId: number): Promise<void> {
  if (disposed || requestId !== refreshRequestId) return;
  try {
    const next = await getStoreRefreshStatus(jobId);
    if (disposed || requestId !== refreshRequestId) return;
    refreshJob.value = next;
    if (next.status === 'done') {
      refreshError.value = next.result?.warnings.join('；') || null;
      await reload();
      return;
    }
    if (next.status === 'error' || next.status === 'interrupted') {
      refreshError.value = next.error || '门店刷新失败，旧数据仍保留';
      return;
    }
  } catch (cause) {
    if (disposed || requestId !== refreshRequestId) return;
    if (Date.now() - refreshStartedAt > 30 * 60 * 1000) {
      refreshError.value = cause instanceof Error ? cause.message : '门店刷新状态查询超时';
      return;
    }
    refreshTimer = setTimeout(() => void pollRefreshJob(jobId, requestId), 2000);
    return;
  }
  refreshTimer = setTimeout(() => void pollRefreshJob(jobId, requestId), 1500);
}

async function attachActiveRefresh() {
  try {
    const active = await getActiveStoreRefresh();
    if (disposed || !active || (active.status !== 'queued' && active.status !== 'pulling')) return;
    const requestId = ++refreshRequestId;
    refreshStartedAt = Date.now();
    refreshJob.value = active;
    await pollRefreshJob(active.jobId, requestId);
  } catch (cause) {
    if (!disposed)
      refreshError.value = cause instanceof Error ? cause.message : '门店同步状态读取失败';
  }
}

async function refreshExternalStores() {
  if (!canManageMerchants.value || refreshing.value) return;
  clearRefreshTimer();
  const requestId = ++refreshRequestId;
  refreshStarting.value = true;
  refreshError.value = null;
  refreshStartedAt = Date.now();
  try {
    const job = await startStoreRefresh();
    if (disposed || requestId !== refreshRequestId) return;
    refreshJob.value = job;
    await pollRefreshJob(job.jobId, requestId);
  } catch (cause) {
    if (!disposed && requestId === refreshRequestId)
      refreshError.value = cause instanceof Error ? cause.message : '门店刷新启动失败';
  } finally {
    if (!disposed && requestId === refreshRequestId) refreshStarting.value = false;
  }
}

function openCreate() {
  if (!canManageMerchants.value) return;
  resetForm();
  createVisible.value = true;
}

async function submitCreate() {
  if (!canManageMerchants.value) return;
  if (!form.merchantId || !form.storeName.trim()) {
    ElMessage.warning('请选择商家并填写门店名称');
    return;
  }
  saving.value = true;
  try {
    await createStore(
      {
        ...form,
        address: form.address || undefined,
        areaName: form.areaName || undefined,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        businessHours: form.businessHours || undefined
      },
      buildBusinessIntentKey('store', form.merchantId, form.storeName.trim(), Date.now())
    );
    ElMessage.success('门店已创建');
    createVisible.value = false;
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '门店创建失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await reload();
  await attachActiveRefresh();
});
onScopeDispose(() => {
  disposed = true;
  clearRefreshTimer();
});
</script>

<template>
  <section v-loading="loading" class="page-stack store-page">
    <div class="store-header">
      <div>
        <p class="store-kicker">STORE DIRECTORY</p>
        <h2>门店管理</h2>
      </div>
      <div class="store-header__actions">
        <AppleButton variant="secondary" size="sm" :loading="loading" @click="reload">
          <template #icon><el-icon><Refresh /></el-icon></template>
          重新加载
        </AppleButton>
        <AppleButton
          v-if="canManageMerchants"
          variant="secondary"
          size="sm"
          :loading="refreshing"
          @click="refreshExternalStores"
        >
          同步外部门店
        </AppleButton>
        <AppleButton v-if="canManageMerchants" variant="primary" size="sm" @click="openCreate">
          <template #icon><el-icon><Plus /></el-icon></template>
          新建门店
        </AppleButton>
      </div>
    </div>

    <p v-if="refreshStatusText" class="store-refresh-status">{{ refreshStatusText }}</p>

    <ErrorAlert :message="error" />
    <ErrorAlert :message="refreshError" />

    <section class="store-card">
      <div class="store-card__head">
        <h3>门店列表</h3>
        <span class="store-count">共 {{ total.toLocaleString('zh-CN') }} 家</span>
      </div>

      <div class="store-filter">
        <el-input
          v-model="search"
          clearable
          placeholder="搜索门店、商家或地址"
          class="store-filter__input"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select
          v-model="areaName"
          clearable
          placeholder="区域"
          class="store-filter__area"
          @change="handleSearch"
        >
          <el-option v-for="area in SHENZHEN_DISTRICTS" :key="area" :label="area" :value="area" />
        </el-select>
        <el-select
          v-model="status"
          clearable
          placeholder="状态"
          class="store-filter__status"
          @change="handleSearch"
        >
          <el-option label="营业中" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <AppleButton variant="primary" size="sm" @click="handleSearch">查询</AppleButton>
      </div>

      <div ref="tableWrapRef" class="store-table-wrap">
        <el-table :data="items" row-key="storeId" class="store-table">
          <el-table-column label="门店" min-width="190">
            <template #default="{ row }">
              <div class="store-cell">
                <strong>{{ row.storeName }}</strong>
                <small>{{ row.merchantName || row.merchantId }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="区域" width="120">
            <template #default="{ row }">
              <span class="store-soft">{{ row.areaName || '未填写' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="地址" min-width="220">
            <template #default="{ row }">
              <span class="store-soft">{{ row.address || '未填写' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="坐标" width="170">
            <template #default="{ row }">
              <span class="store-soft">
                {{
                  row.latitude != null && row.longitude != null
                    ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}`
                    : '未同步'
                }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="联系人" width="140">
            <template #default="{ row }">
              <div class="store-cell">
                <strong>{{ row.contactName || '未填写' }}</strong>
                <small v-if="row.contactPhone">{{ row.contactPhone }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="120">
            <template #default="{ row }">
              <span class="store-pill" :class="sourcePillClass(row.source)">
                {{ sourceLabel(row.source) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <span class="store-pill" :class="statusPillClass(row.status)">
                {{ row.status === 'active' ? '营业中' : '停用' }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!loading && !items.length" class="store-empty">
          <span class="store-empty__glyph">🏪</span>
          <p>暂无门店或商家档案</p>
        </div>
      </div>

      <div class="store-pager">
        <span class="store-pager__meta">{{ page }} / {{ totalPages }} 页</span>
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          small
          background
          layout="prev, pager, next, jumper"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-if="canManageMerchants"
      v-model="createVisible"
      title="新建门店"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="所属商家" required>
          <el-select v-model="form.merchantId" filterable style="width: 100%">
            <el-option
              v-for="merchant in merchants"
              :key="merchant.merchantId"
              :label="merchant.merchantName"
              :value="merchant.merchantId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="门店名称" required><el-input v-model="form.storeName" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="区域"><el-input v-model="form.areaName" /></el-form-item>
          <el-form-item label="营业时间">
            <el-input v-model="form.businessHours" placeholder="如 09:00-22:00" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="联系人"><el-input v-model="form.contactName" /></el-form-item>
          <el-form-item label="联系电话"><el-input v-model="form.contactPhone" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <AppleButton variant="secondary" size="sm" @click="createVisible = false">取消</AppleButton>
        <AppleButton variant="primary" size="sm" :loading="saving" @click="submitCreate">
          创建
        </AppleButton>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.store-page {
  min-width: 0;
}

/* ---- 页头 ---- */
.store-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.store-kicker {
  margin: 0 0 5px;
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.store-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.store-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.store-refresh-status {
  margin: -4px 0 8px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(0, 122, 255, 0.08);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
}

/* ---- 面板卡片 ---- */
.store-card {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.store-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.store-card__head h3 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
}
.store-count {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* ---- 筛选栏 ---- */
.store-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.store-filter__input {
  width: 280px;
  max-width: 100%;
}
.store-filter__status {
  width: 120px;
}
.store-filter__area {
  width: 120px;
}

/* ---- 表格滚动容器 ---- */
.store-table-wrap {
  flex: 1;
  min-height: 0;
  max-height: calc(100vh - 340px);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
}

/* ---- el-table 苹果风覆盖 ---- */
.store-table :deep(.el-table__inner-wrapper) {
  font-size: 12px;
}
.store-table :deep(th.el-table__cell) {
  background: var(--soft);
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  border-bottom: 1px solid var(--line);
}
.store-table :deep(td.el-table__cell) {
  border-bottom: 1px solid var(--soft-strong);
  color: var(--ink-soft);
  padding: 8px 0;
}
.store-table :deep(.el-table__row:hover td.el-table__cell) {
  background: rgba(120, 120, 128, 0.06);
}
.store-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.store-cell strong {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
}
.store-cell small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
}
.store-soft {
  color: var(--muted);
  font-size: 12px;
}

/* ---- 苹果风胶囊标签（替代 el-tag） ---- */
.store-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.12);
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.4;
  white-space: nowrap;
}
.store-pill--success {
  background: rgba(52, 199, 89, 0.14);
  color: #248a3d;
}
.store-pill--warn {
  background: rgba(255, 149, 0, 0.14);
  color: #c93400;
}
.store-pill--info {
  background: rgba(0, 122, 255, 0.12);
  color: #0066d6;
}
.store-pill--muted {
  background: rgba(120, 120, 128, 0.12);
  color: var(--muted);
}

/* ---- 空状态 ---- */
.store-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 160px;
  padding: 24px 16px;
  color: var(--muted);
  text-align: center;
}
.store-empty__glyph {
  font-size: 28px;
  line-height: 1;
  opacity: 0.85;
}
.store-empty p {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

/* ---- 底部固定分页栏 ---- */
.store-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  bottom: 0;
  padding: 10px 0 2px;
  background: var(--panel);
  border-top: 1px solid var(--line);
  z-index: 2;
}
.store-pager__meta {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* ---- 表单 ---- */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

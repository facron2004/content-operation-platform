<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
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
        page: 1,
        pageSize: 100
      }),
      listStoreMerchantOptions()
    ]);
    items.value = storeData.items;
    merchants.value = merchantData;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '门店加载失败';
  } finally {
    loading.value = false;
  }
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
  <section v-loading="loading" class="page-stack gap-page">
    <div class="page-toolbar">
      <el-button v-if="canManageMerchants" :loading="refreshing" @click="refreshExternalStores">
        刷新外部门店数据
      </el-button>
      <el-button :loading="loading" @click="reload">重新加载</el-button>
      <el-button v-if="canManageMerchants" type="primary" @click="openCreate">新建门店</el-button>
      <span v-if="refreshStatusText" class="refresh-status">{{ refreshStatusText }}</span>
    </div>
    <ErrorAlert :message="error" />
    <ErrorAlert :message="refreshError" />
    <section class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">STORE DIRECTORY</p>
          <h2>门店列表</h2>
        </div>
        <span class="section-meta">{{ items.length }} 条</span>
      </div>
      <div class="gap-toolbar">
        <el-input
          v-model="search"
          clearable
          placeholder="搜索门店、商家或地址"
          @keyup.enter="reload"
        />
        <el-select v-model="status" clearable placeholder="状态" @change="reload">
          <el-option label="营业中" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
        <el-button type="primary" @click="reload">查询</el-button>
      </div>
      <el-table :data="items" row-key="storeId">
        <el-table-column label="门店" min-width="190">
          <template #default="{ row }">
            <strong>{{ row.storeName }}</strong>
            <small class="muted">{{ row.merchantName || row.merchantId }}</small>
          </template>
        </el-table-column>
        <el-table-column label="区域" width="130">
          <template #default="{ row }">{{ row.areaName || '未填写' }}</template>
        </el-table-column>
        <el-table-column label="地址" min-width="230">
          <template #default="{ row }">{{ row.address || '未填写' }}</template>
        </el-table-column>
        <el-table-column label="坐标" width="170">
          <template #default="{ row }">
            {{
              row.latitude != null && row.longitude != null
                ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}`
                : '未同步'
            }}
          </template>
        </el-table-column>
        <el-table-column label="联系人" width="150">
          <template #default="{ row }">
            {{ row.contactName || '未填写' }}
            <small v-if="row.contactPhone" class="muted">{{ row.contactPhone }}</small>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="140">
          <template #default="{ row }">
            <el-tag
              size="small"
              effect="plain"
              :type="row.source === 'merchant_projection' ? 'warning' : 'success'"
            >
              {{
                row.source === 'merchant_projection'
                  ? '商家档案投影'
                  : row.source === 'jeesite_partner_shop'
                    ? '合作商店铺'
                    : '门店记录'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag
              size="small"
              effect="plain"
              :type="row.status === 'active' ? 'success' : 'info'"
            >
              {{ row.status === 'active' ? '营业中' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无门店或商家档案" />
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
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.gap-page {
  min-width: 0;
}
.gap-actions,
.gap-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.gap-toolbar {
  margin: 16px 0;
}
.gap-toolbar .el-input {
  width: 280px;
  max-width: 100%;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.section-heading h2 {
  margin: 4px 0 0;
}
.section-meta,
.muted,
.refresh-status {
  color: var(--muted);
  font-size: 12px;
}
.muted {
  display: block;
  margin-top: 4px;
}
.refresh-status {
  margin-left: 4px;
}
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

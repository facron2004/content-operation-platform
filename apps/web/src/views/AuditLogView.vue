<template>
  <section class="page-stack audit-log-page">
    <div class="page-header">
      <h2>操作审计（{{ windowLabel }}）</h2>
    </div>

    <el-card style="margin-bottom: 16px">
      <el-form :model="filters" inline>
        <el-form-item label="操作者">
          <el-input v-model="filters.userId" placeholder="用户 ID" clearable style="width: 160px" />
        </el-form-item>
        <el-form-item label="对象类型">
          <el-select v-model="filters.objectType" placeholder="全部" clearable style="width: 140px">
            <el-option label="活动" value="campaign" />
            <el-option label="任务" value="task" />
            <el-option label="文案" value="copy" />
            <el-option label="社群" value="community" />
            <el-option label="用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作">
          <el-input
            v-model="filters.action"
            placeholder="操作名称"
            clearable
            style="width: 160px"
          />
        </el-form-item>
        <!-- Residual #193: date range already on DTO + listAuditLogs client. -->
        <el-form-item label="起始日">
          <el-date-picker
            v-model="filters.dateFrom"
            type="date"
            placeholder="开始日期"
            value-format="YYYY-MM-DD"
            clearable
            style="width: 150px"
          />
        </el-form-item>
        <el-form-item label="截止日">
          <el-date-picker
            v-model="filters.dateTo"
            type="date"
            placeholder="结束日期"
            value-format="YYYY-MM-DD"
            clearable
            style="width: 150px"
          />
        </el-form-item>
        <el-form-item>
          <div class="button-row">
            <AppleButton variant="primary" @click="load()">查询</AppleButton>
            <AppleButton variant="secondary" @click="resetFilters">重置</AppleButton>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Residual #273: list INTERACTIVE_LIST_MAX_DAYS window honesty. -->
    <p v-if="listDateFrom && listDateTo" class="list-window-hint">
      仅展示 {{ windowLabel }} 内的操作日志；更早记录不在本列表分页范围内（交互查询上限 90 天）。
    </p>

    <el-table
      v-loading="loading"
      :data="items"
      stripe
      style="width: 100%"
      empty-text="暂无审计日志"
    >
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作者" prop="username" width="120" />
      <el-table-column label="操作" prop="action" min-width="160" />
      <el-table-column label="对象类型" width="100">
        <template #default="{ row }">{{ objectTypeLabel(row.objectType) }}</template>
      </el-table-column>
      <el-table-column label="对象 ID" prop="objectId" min-width="160">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.objectId || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="结果" width="80">
        <template #default="{ row }">
          <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="详情" width="80">
        <template #default="{ row }">
          <AppleButton variant="ghost" size="sm" @click="showDetail(row)">查看</AppleButton>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="pagination.total > pagination.pageSize" style="margin-top: 16px; text-align: right">
      <el-pagination
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="setPage"
      />
    </div>

    <el-dialog v-model="detailVisible" title="操作详情" width="720px" @closed="onDetailClosed">
      <div v-loading="detailLoading">
        <el-descriptions v-if="selectedLog" column="1" border>
          <el-descriptions-item label="日志 ID">{{ selectedLog.logId }}</el-descriptions-item>
          <el-descriptions-item label="操作者">
            {{ selectedLog.username || selectedLog.userId || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="操作">{{ selectedLog.action }}</el-descriptions-item>
          <el-descriptions-item label="对象类型">
            {{ objectTypeLabel(selectedLog.objectType) }}
          </el-descriptions-item>
          <el-descriptions-item label="对象 ID">
            {{ selectedLog.objectId || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="IP">{{ selectedLog.ip || '-' }}</el-descriptions-item>
          <el-descriptions-item label="时间">
            {{ formatTime(selectedLog.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="结果">
            <el-tag :type="selectedLog.result === 'success' ? 'success' : 'danger'">
              {{ selectedLog.result === 'success' ? '成功' : '失败' }}
            </el-tag>
            <span v-if="selectedLog.failReason" style="margin-left: 8px; color: #e74c3c">
              {{ selectedLog.failReason }}
            </span>
          </el-descriptions-item>
          <!-- Residual #185: before/after only on detail GET (list omits free-form blobs). -->
          <el-descriptions-item label="变更前">
            <pre v-if="selectedLog.before" class="payload-pre">{{
              formatPayload(selectedLog.before)
            }}</pre>
            <span v-else class="payload-empty">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="变更后">
            <pre v-if="selectedLog.after" class="payload-pre">{{
              formatPayload(selectedLog.after)
            }}</pre>
            <span v-else class="payload-empty">—</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';
import { usePagedList } from '../composables/usePagedList';
import AppleButton from '../components/AppleButton.vue';

// Residual #185: align with OperationAuditLogEntry (before/after on detail only).
type AuditLogRow = {
  logId?: string;
  username?: string;
  userId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  ip?: string;
  createdAt?: string;
  result?: string;
  failReason?: string;
  before?: string;
  after?: string;
};

type AuditFilters = {
  userId: string;
  objectType: string;
  action: string;
  // Residual #193: wire dateFrom/dateTo already on AuditLogQueryDto + listAuditLogs.
  dateFrom: string;
  dateTo: string;
};

// Residual #273: prefer API effective window over filter inputs (filters may be empty).
const listDateFrom = ref<string | undefined>();
const listDateTo = ref<string | undefined>();
const windowLabel = computed(() => {
  if (listDateFrom.value && listDateTo.value) {
    return `${listDateFrom.value} ~ ${listDateTo.value}`;
  }
  return '近 90 天';
});

const { items, loading, pagination, filters, load, setPage, updateFilter } = usePagedList<
  AuditLogRow,
  AuditFilters
>(
  async ({ page, pageSize, filters: f }) => {
    const params: Record<string, unknown> = { page, pageSize };
    if (f.userId) params.userId = f.userId;
    if (f.objectType) params.objectType = f.objectType;
    if (f.action) params.action = f.action;
    if (f.dateFrom) params.dateFrom = f.dateFrom;
    if (f.dateTo) params.dateTo = f.dateTo;
    const data = await api.listAuditLogs(params);
    // Residual #185: API returns { data, total, page, pageSize } — not { items }.
    // Prefer client-normalized items when present; fall back to raw data array.
    const rows = (data.items ?? data.data ?? []) as AuditLogRow[];
    // Residual #273: sink INTERACTIVE window projected by list.
    listDateFrom.value = data.dateFrom;
    listDateTo.value = data.dateTo;
    return { items: rows, total: data.total ?? 0 };
  },
  { userId: '', objectType: '', action: '', dateFrom: '', dateTo: '' },
  {
    filterDebounceMs: 0,
    onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载审计日志失败'))
  }
);

const detailVisible = ref(false);
const detailLoading = ref(false);
const selectedLog = ref<AuditLogRow | null>(null);

function objectTypeLabel(type: unknown): string {
  const map: Record<string, string> = {
    campaign: '活动',
    task: '任务',
    copy: '文案',
    community: '社群',
    user: '用户'
  };
  return map[String(type)] || String(type);
}

function formatTime(t: unknown): string {
  if (!t) return '-';
  try {
    return new Date(String(t)).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(t);
  }
}

function formatPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function resetFilters() {
  updateFilter({ userId: '', objectType: '', action: '', dateFrom: '', dateTo: '' });
  load();
}

function onDetailClosed() {
  selectedLog.value = null;
  detailLoading.value = false;
}

// Residual #185: list omits before/after — fetch full row via getAuditLog.
async function showDetail(row: AuditLogRow) {
  selectedLog.value = row;
  detailVisible.value = true;
  if (!row.logId) return;
  detailLoading.value = true;
  try {
    const full = (await api.getAuditLog(row.logId)) as AuditLogRow | null;
    if (full) selectedLog.value = full;
  } catch (err) {
    // Keep list-row fields visible; before/after stay empty.
    ElMessage.warning(extractErrorMessage(err, '加载审计详情失败'));
  } finally {
    detailLoading.value = false;
  }
}

onMounted(() => load());
</script>

<style scoped>
.audit-log-page {
  padding: 0;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.payload-pre {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  background: var(--el-fill-color-light, #f5f7fa);
  padding: 8px 10px;
  border-radius: 4px;
}
.payload-empty {
  color: var(--el-text-color-secondary, #909399);
}
/* Residual #273: INTERACTIVE_LIST_MAX_DAYS window honesty. */
.list-window-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>

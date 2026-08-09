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

    <ErrorAlert :message="error" />

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
        <ErrorAlert :message="detailError" />
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
import { onMounted } from 'vue';
import AppleButton from '../components/AppleButton.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useAuditLogList } from '../features/audit-log/useAuditLogList';
import { useAuditLogDetail } from '../features/audit-log/useAuditLogDetail';

const {
  items,
  loading,
  error,
  pagination,
  filters,
  load,
  setPage,
  resetFilters,
  listDateFrom,
  listDateTo,
  windowLabel
} = useAuditLogList();

const { detailVisible, detailLoading, detailError, selectedLog, showDetail, onDetailClosed } =
  useAuditLogDetail();

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

onMounted(() => {
  void load();
});
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

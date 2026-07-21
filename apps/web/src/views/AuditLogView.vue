<template>
  <section class="page-stack audit-log-page">
    <div class="page-header">
      <h2>操作审计</h2>
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
        <el-form-item>
          <el-button type="primary" @click="loadLogs">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="logs" stripe style="width: 100%" empty-text="暂无审计日志">
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
          <el-button text size="small" @click="showDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > pageSize" style="margin-top: 16px; text-align: right">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="loadLogs"
      />
    </div>

    <el-dialog v-model="detailVisible" title="操作详情" width="640px">
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
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { api } from '../services/api';

const loading = ref(false);
const logs = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ userId: '', objectType: '', action: '' });
const detailVisible = ref(false);
const selectedLog = ref<Record<string, unknown> | null>(null);

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

async function loadLogs() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value };
    if (filters.userId) params.userId = filters.userId;
    if (filters.objectType) params.objectType = filters.objectType;
    if (filters.action) params.action = filters.action;
    const data = await api.listAuditLogs(params);
    logs.value = data.items ?? [];
    total.value = data.total ?? 0;
  } catch {
    logs.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.userId = '';
  filters.objectType = '';
  filters.action = '';
  page.value = 1;
  loadLogs();
}

function showDetail(row: Record<string, unknown>) {
  selectedLog.value = row;
  detailVisible.value = true;
}

onMounted(loadLogs);
</script>

<style scoped>
.audit-log-page {
  padding: 20px;
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
</style>

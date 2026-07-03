<template>
  <section class="audit-layout">
    <section class="panel">
      <div class="panel-head">
        <h2>审核队列</h2>
        <el-segmented v-model="status" :options="statusOptions" @change="load" />
      </div>
      <TableSkeleton v-if="loading && copies.length === 0" :rows="10" :columns="5" />
      <el-table
        v-else
        :data="copies"
        height="650"
        highlight-current-row
        @current-change="selectCopy"
      >
        <el-table-column prop="copyVersion" label="版本" width="70" />
        <el-table-column prop="title" label="标题" min-width="190" show-overflow-tooltip />
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">{{ channelLabels[row.channel] }}</template>
        </el-table-column>
        <el-table-column prop="riskLevel" label="风险" width="86" />
        <el-table-column prop="auditStatus" label="状态" width="100" />
        <template #empty>
          <EmptyState
            icon="✅"
            title="暂无待审核文案"
            description="当前状态下没有文案需要处理"
            action-text="去生成文案"
            @action="$router.push('/generate')"
          />
        </template>
      </el-table>
    </section>

    <section class="panel review-panel">
      <div class="panel-head">
        <h2>审核内容</h2>
      </div>
      <el-empty v-if="!selected" description="选择一条文案" />
      <template v-else>
        <el-form label-position="top">
          <el-form-item label="标题" required>
            <el-input v-model="draft.title" placeholder="请输入标题" />
          </el-form-item>
          <el-form-item label="正文" required>
            <el-input v-model="draft.body" type="textarea" :rows="8" placeholder="请输入正文内容" />
          </el-form-item>
          <el-form-item label="审核备注">
            <el-input
              v-model="draft.auditRemark"
              type="textarea"
              :rows="3"
              placeholder="选填，记录审核意见"
            />
          </el-form-item>
        </el-form>
        <div class="check-list">
          <span>价格一致</span>
          <span>库存一致</span>
          <span>时间准确</span>
          <span>保留限制</span>
          <span>渠道风格</span>
        </div>
        <div class="button-row">
          <el-button type="success" @click="audit('approved')">通过</el-button>
          <el-button type="warning" @click="audit('risk')">标记风险</el-button>
          <el-button type="danger" @click="audit('rejected')">驳回</el-button>
        </div>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { AuditStatus, GeneratedCopy } from '@content/shared';
import { api } from '../services/api';
import { auditStatusLabels, channelLabels } from '../utils/labels';
import TableSkeleton from '../components/TableSkeleton.vue';
import EmptyState from '../components/EmptyState.vue';

const loading = ref(false);
const status = ref<AuditStatus>('pending');
const copies = ref<GeneratedCopy[]>([]);
const selected = ref<GeneratedCopy | null>(null);
const draft = reactive({ title: '', body: '', auditRemark: '' });
const statusOptions = (Object.entries(auditStatusLabels) as Array<[string, string]>)
  .filter(([value]) => value !== 'draft')
  .map(([value, label]) => ({ label, value }));

const load = async () => {
  loading.value = true;
  try {
    const data = await api.listCopies({ auditStatus: status.value });
    copies.value = data.items;
    if (!copies.value.some((copy) => copy.contentId === selected.value?.contentId))
      selected.value = null;
  } finally {
    loading.value = false;
  }
};

const selectCopy = (copy: GeneratedCopy | null) => {
  selected.value = copy;
  draft.title = copy?.title ?? '';
  draft.body = copy?.body ?? '';
  draft.auditRemark = copy?.auditRemark ?? '';
};

const audit = async (auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>) => {
  if (!selected.value) return;

  if (!draft.title.trim() || !draft.body.trim()) {
    ElMessage.warning('标题和正文不能为空');
    return;
  }

  try {
    await api.auditCopy(selected.value.contentId, {
      auditStatus,
      title: draft.title,
      body: draft.body,
      auditRemark: draft.auditRemark || (auditStatus === 'approved' ? '通过' : '')
    });

    const statusText =
      auditStatus === 'approved' ? '通过' : auditStatus === 'rejected' ? '驳回' : '标记为风险';
    ElMessage.success(`审核结果已保存：${statusText}`);
    await load();
  } catch {
    // 错误已由拦截器处理
  }
};

onMounted(load);
</script>

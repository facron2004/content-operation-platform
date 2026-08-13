<template>
  <section v-loading="loading" class="page-stack merchant-applications-view">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">刷新</el-button>
      <el-button type="primary" @click="openCreate">新建入驻申请</el-button>
    </div>

    <ErrorAlert :message="error" />

    <section class="panel merchant-applications-panel">
      <div class="merchant-applications-toolbar">
        <el-input
          v-model="search"
          clearable
          placeholder="搜索申请单、企业或联系人"
          @keyup.enter="reload"
        />
        <el-select v-model="status" clearable placeholder="全部状态" @change="reload">
          <el-option label="待资质审核" value="submitted" />
          <el-option label="待合同审核" value="qualification_approved" />
          <el-option label="待启用" value="contract_approved" />
          <el-option label="已启用" value="enabled" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-button type="primary" @click="reload">查询</el-button>
      </div>

      <el-table :data="items" row-key="applicationId" @row-click="openDetail">
        <el-table-column label="申请单" min-width="190">
          <template #default="{ row }">
            <div class="application-cell">
              <strong>{{ row.enterpriseName }}</strong>
              <small>{{ row.applicationNo }} · {{ row.areaName || '未填写区域' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="联系人" width="150">
          <template #default="{ row }">{{ row.contactName }} · {{ row.contactPhone }}</template>
        </el-table-column>
        <el-table-column label="资料" width="130">
          <template #default="{ row }">
            <span>{{ row.qualificationProvided ? '资质已提交' : '资质待补充' }}</span>
            <small class="application-muted">{{ row.licenseNo || '证照未填' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="statusType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="170">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click.stop="openDetail(row)">详情</el-button>
            <el-button
              v-if="row.status === 'submitted'"
              size="small"
              text
              type="primary"
              :loading="actionLoading"
              @click.stop="review(row, 'qualification-approve')"
            >
              通过资质
            </el-button>
            <el-button
              v-else-if="row.status === 'qualification_approved'"
              size="small"
              text
              type="primary"
              :loading="actionLoading"
              @click.stop="review(row, 'contract-approve')"
            >
              通过合同
            </el-button>
            <el-button
              v-else-if="row.status === 'contract_approved'"
              size="small"
              text
              type="primary"
              :loading="actionLoading"
              @click.stop="review(row, 'enable')"
            >
              启用
            </el-button>
            <el-button
              v-if="
                ['submitted', 'qualification_approved', 'contract_approved'].includes(row.status)
              "
              size="small"
              text
              type="danger"
              :loading="actionLoading"
              @click.stop="review(row, 'reject')"
            >
              驳回
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无入驻申请" />
      <div v-if="pagination.total > pagination.pageSize" class="merchant-applications-pagination">
        <el-pagination
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="setPage"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建商家入驻申请" width="560px">
      <el-form label-width="100px">
        <el-form-item label="企业名称" required>
          <el-input v-model="form.enterpriseName" />
        </el-form-item>
        <el-form-item label="联系人" required><el-input v-model="form.contactName" /></el-form-item>
        <el-form-item label="联系电话" required>
          <el-input v-model="form.contactPhone" />
        </el-form-item>
        <el-form-item label="证照编号"><el-input v-model="form.licenseNo" /></el-form-item>
        <el-form-item label="资质资料">
          <el-input
            v-model="form.qualificationJson"
            type="textarea"
            :rows="3"
            placeholder="可填写 JSON 或资料索引"
          />
        </el-form-item>
        <el-form-item label="门店名称"><el-input v-model="form.storeName" /></el-form-item>
        <el-form-item label="门店地址"><el-input v-model="form.storeAddress" /></el-form-item>
        <el-form-item label="开户名称"><el-input v-model="form.bankAccountName" /></el-form-item>
        <el-form-item label="开户账号"><el-input v-model="form.bankAccountNo" /></el-form-item>
        <el-form-item label="区域"><el-input v-model="form.areaName" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitCreate">
          提交申请
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="入驻申请详情" width="600px">
      <template v-if="selected">
        <div class="application-detail-grid">
          <div>
            <span>企业</span>
            <strong>{{ selected.enterpriseName }}</strong>
          </div>
          <div>
            <span>联系人</span>
            <strong>{{ selected.contactName }} · {{ selected.contactPhone }}</strong>
          </div>
          <div>
            <span>证照</span>
            <strong>{{ selected.licenseNo || '未填写' }}</strong>
          </div>
          <div>
            <span>门店</span>
            <strong>{{ selected.storeName || '未填写' }}</strong>
          </div>
          <div>
            <span>地址</span>
            <strong>{{ selected.storeAddress || '未填写' }}</strong>
          </div>
          <div>
            <span>银行账户</span>
            <strong>
              {{ selected.bankAccountName || '未填写' }} · {{ selected.bankAccountNo || '未填写' }}
            </strong>
          </div>
        </div>
        <div class="application-detail-history">
          <h3>审核轨迹</h3>
          <div v-for="item in selected.approvals" :key="item.id" class="application-history-row">
            <strong>{{ statusLabel(item.toStatus) }}</strong>
            <span>{{ item.remark || '—' }}</span>
            <small>{{ formatDate(item.createdAt) }}</small>
          </div>
          <el-empty v-if="!selected.approvals.length" description="尚无审核动作" :image-size="42" />
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createMerchantApplication,
  listMerchantApplications,
  transitionMerchantApplication,
  type MerchantApplication,
  type MerchantApplicationStatus
} from '../services/api/merchant-application.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';

const PAGE_SIZE = 20;
const loading = ref(false);
const actionLoading = ref(false);
const error = ref<string | null>(null);
const search = ref('');
const status = ref<MerchantApplicationStatus | undefined>();
const items = ref<MerchantApplication[]>([]);
const selected = ref<MerchantApplication | null>(null);
const createVisible = ref(false);
const detailVisible = ref(false);
const page = ref(1);
const pagination = ref({ page: 1, pageSize: PAGE_SIZE, total: 0, hasMore: false });
const form = reactive({
  enterpriseName: '',
  contactName: '',
  contactPhone: '',
  licenseNo: '',
  qualificationJson: '',
  storeName: '',
  storeAddress: '',
  bankAccountName: '',
  bankAccountNo: '',
  areaName: ''
});

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const response = await listMerchantApplications({
      search: search.value.trim() || undefined,
      status: status.value,
      page: page.value,
      pageSize: PAGE_SIZE
    });
    items.value = response.items;
    pagination.value = response.pagination;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '入驻申请加载失败';
  } finally {
    loading.value = false;
  }
}

function setPage(next: number) {
  page.value = next;
  void reload();
}

function openCreate() {
  Object.assign(form, {
    enterpriseName: '',
    contactName: '',
    contactPhone: '',
    licenseNo: '',
    qualificationJson: '',
    storeName: '',
    storeAddress: '',
    bankAccountName: '',
    bankAccountNo: '',
    areaName: ''
  });
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.enterpriseName.trim() || !form.contactName.trim() || !form.contactPhone.trim()) {
    ElMessage.warning('企业名称、联系人和联系电话为必填项');
    return;
  }
  actionLoading.value = true;
  try {
    await createMerchantApplication(
      { ...form },
      buildBusinessIntentKey('merchant-application', Date.now())
    );
    ElMessage.success('入驻申请已创建');
    createVisible.value = false;
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '入驻申请创建失败');
  } finally {
    actionLoading.value = false;
  }
}

function openDetail(row: MerchantApplication) {
  selected.value = row;
  detailVisible.value = true;
}

async function review(
  row: MerchantApplication,
  action: 'qualification-approve' | 'contract-approve' | 'enable' | 'reject'
) {
  let remark: string | undefined;
  try {
    if (action === 'reject') {
      const result = await ElMessageBox.prompt('请输入驳回原因', '驳回入驻申请', {
        inputValidator: (value) => (value?.trim() ? true : '驳回原因不能为空'),
        inputErrorMessage: '驳回原因不能为空'
      });
      remark = result.value;
    } else {
      await ElMessageBox.confirm(
        `确认执行“${action === 'enable' ? '启用' : '审核通过'}”？`,
        '入驻审核',
        { type: 'warning' }
      );
    }
    actionLoading.value = true;
    await transitionMerchantApplication(
      row.applicationId,
      action,
      remark,
      buildBusinessIntentKey('merchant-approval', row.applicationId, action, Date.now())
    );
    ElMessage.success('审核动作已完成');
    detailVisible.value = false;
    await reload();
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') {
      ElMessage.error(cause instanceof Error ? cause.message : '审核动作失败');
    }
  } finally {
    actionLoading.value = false;
  }
}

function statusLabel(value: string) {
  return (
    {
      submitted: '待资质审核',
      qualification_approved: '待合同审核',
      contract_approved: '待启用',
      enabled: '已启用',
      rejected: '已驳回'
    }[value] ?? value
  );
}

function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (value === 'enabled') return 'success';
  if (value === 'rejected') return 'danger';
  if (value === 'submitted') return 'warning';
  return 'info';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

void reload();
</script>

<style src="../styles/views/merchant-applications.css" scoped></style>

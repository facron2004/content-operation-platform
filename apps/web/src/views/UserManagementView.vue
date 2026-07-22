<template>
  <section class="page-stack user-management-page">
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" :icon="Plus" @click="showCreate = true">新建用户</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="items"
      stripe
      style="width: 100%"
      empty-text="暂无用户数据"
    >
      <el-table-column label="用户名" prop="username" min-width="120" />
      <el-table-column label="显示名称" prop="displayName" min-width="120" />
      <el-table-column label="邮箱" prop="email" min-width="160" />
      <el-table-column label="角色" min-width="200">
        <template #default="{ row }">
          <el-tag v-for="r in row.roles" :key="r.role" size="small" style="margin-right: 4px">
            {{ roleLabels[r.role] || r.role }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="160">
        <template #default="{ row }">{{ row.lastLoginAt || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button
            v-if="row.isActive"
            text
            type="warning"
            size="small"
            @click="handleDeactivate(row)"
          >
            停用
          </el-button>
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

    <el-dialog v-model="showCreate" title="新建用户" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="显示名称" prop="displayName">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElForm } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';
import { usePagedList } from '../composables/usePagedList';

type UserRoleBinding = { role: string; scopeType?: string; scopeId?: string };
type UserRow = {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  roles?: UserRoleBinding[];
  isActive?: boolean;
  lastLoginAt?: string;
};

const roleLabels: Record<string, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  executor: '执行人员',
  admin: '管理员'
};

const { items, loading, pagination, load, setPage, reloadCurrentPage } = usePagedList<
  UserRow,
  Record<string, string>
>(
  async ({ page, pageSize }) => {
    const data = await api.listUsers({ page, pageSize });
    return { items: (data.items ?? []) as UserRow[], total: data.total ?? 0 };
  },
  {},
  {
    filterDebounceMs: 0,
    onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载用户列表失败'))
  }
);

const showCreate = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof ElForm>>();
const form = ref({ username: '', password: '', displayName: '', email: '' });
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, min: 6, message: '密码至少 6 位', trigger: 'blur' }]
};

function handleEdit(row: UserRow) {
  ElMessage.info(`编辑用户 ${row.username} 功能待完善`);
}

async function handleDeactivate(row: UserRow) {
  try {
    await api.deactivateUser(row.userId);
    ElMessage.success('用户已停用');
    await reloadCurrentPage();
  } catch {
    ElMessage.error('停用失败');
  }
}

async function handleCreate() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    await api.createUser({ ...form.value });
    ElMessage.success('用户已创建');
    showCreate.value = false;
    form.value = { username: '', password: '', displayName: '', email: '' };
    await load(true);
  } catch {
    ElMessage.error('创建失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => load());
</script>

<style scoped>
.user-management-page {
  padding: 20px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
</style>

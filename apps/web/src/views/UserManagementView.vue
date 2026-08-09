<template>
  <section class="page-stack user-management-page">
    <div class="page-header">
      <div>
        <p class="page-kicker">IDENTITY / OPERATIONS</p>
        <h2>用户管理</h2>
      </div>
      <AppleButton variant="primary" @click="openCreate">
        <template #icon>
          <el-icon><Plus /></el-icon>
        </template>
        新建用户
      </AppleButton>
    </div>

    <div class="user-filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索用户名 / 显示名 / ID"
        clearable
        class="filter-keyword"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select
        v-model="filters.isActive"
        placeholder="状态"
        clearable
        class="filter-status"
        @change="handleSearch"
        @clear="handleSearch"
      >
        <el-option label="启用" :value="true" />
        <el-option label="停用" :value="false" />
      </el-select>
      <AppleButton variant="primary" @click="handleSearch">搜索</AppleButton>
    </div>

    <ErrorAlert :message="loadError" />
    <ErrorAlert :message="writeError" />

    <UserTable
      :items="items"
      :loading="loading"
      @edit="handleEdit"
      @access="openAccess"
      @deactivate="handleDeactivate"
      @activate="handleActivate"
    />

    <div v-if="pagination.total > pagination.pageSize" class="pagination-wrap">
      <el-pagination
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        layout="prev, pager, next"
        @current-change="setPage"
      />
    </div>

    <UserFormDialog
      v-model="formVisible"
      :is-edit="isEdit"
      :user="editingUser"
      :submitting="submitting"
      @submit="submitUser"
    />

    <UserAccessDrawer v-model="accessVisible" :user="accessUser" @saved="handleAccessSaved" />
  </section>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import AppleButton from '../components/AppleButton.vue';
import UserAccessDrawer from '../features/user-management/UserAccessDrawer.vue';
import UserFormDialog from '../features/user-management/UserFormDialog.vue';
import UserTable from '../features/user-management/UserTable.vue';
import { useUserManagement } from '../features/user-management/useUserManagement';
import ErrorAlert from '../components/ErrorAlert.vue';

const {
  items,
  loading,
  error: loadError,
  writeError,
  pagination,
  filters,
  setPage,
  handleSearch,
  openCreate,
  handleEdit,
  openAccess,
  handleDeactivate,
  handleActivate,
  formVisible,
  isEdit,
  editingUser,
  submitting,
  submitUser,
  accessVisible,
  accessUser,
  handleAccessSaved
} = useUserManagement();
</script>

<style scoped>
.user-management-page {
  padding: 0;
}
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.page-kicker {
  margin: 0 0 5px;
  color: var(--color-primary, #246bfe);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.user-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.user-filter-bar .filter-keyword {
  width: 280px;
  max-width: 100%;
}
.user-filter-bar .filter-status {
  width: 120px;
}
.pagination-wrap {
  margin-top: 16px;
  text-align: right;
}
</style>

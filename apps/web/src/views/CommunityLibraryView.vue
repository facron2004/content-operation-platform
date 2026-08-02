<template>
  <section class="page-stack community-library-page">
    <div class="page-header">
      <h2>社群库</h2>
      <div class="header-actions">
        <AppleButton variant="primary" @click="openCreateDialog()">
          <template #icon>
            <el-icon><Plus /></el-icon>
          </template>
          新建社群
        </AppleButton>
        <AppleButton variant="secondary" @click="openImportDialog()">
          <template #icon>
            <el-icon><Upload /></el-icon>
          </template>
          批量导入
        </AppleButton>
      </div>
    </div>

    <CommunityFilterBar v-model="filters" @search="handleSearch" @reset="handleReset" />

    <CommunityLibraryTable
      v-loading="loading"
      :communities="communities"
      :pagination="pagination"
      @view="handleView"
      @edit="handleEdit"
      @delete="handleDelete"
      @disable="handleDisable"
      @enable="handleEnable"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />

    <CommunityCreateDialog
      v-model="createDialogVisible"
      :submitting="createSubmitting"
      :is-edit="isEdit"
      :form="communityForm"
      @submit="submitCreate"
    />

    <CommunityImportDialog
      v-model="importDialogVisible"
      :importing="importSubmitting"
      @submit="submitImport"
    />

    <!-- Residual #179/#186/#209: drawer with performance + packages + nested tasks. -->
    <el-drawer
      v-model="detailDrawerVisible"
      title="社群详情"
      size="560px"
      class="community-detail-drawer"
    >
      <CommunityDetailCard
        :community="detailCommunity"
        :loading="detailLoading"
        :performance="detailPerformance"
        :packages="detailPackages"
        :packages-loading="detailPackagesLoading"
        :tasks="detailTasks"
        :tasks-total="detailTasksTotal"
        :tasks-page="detailTasksPage"
        :tasks-page-size="detailTasksPageSize"
        :tasks-loading="detailTasksLoading"
        :tasks-window-label="detailTasksWindowLabel"
        @update:tasks-page="setDetailTasksPage"
      />
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Upload } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { useCommunityLibrary } from '../features/community-library/composables/useCommunityLibrary';
import { useCommunityDetail } from '../features/community-library/composables/useCommunityDetail';
import CommunityLibraryTable from '../features/community-library/components/CommunityLibraryTable.vue';
import CommunityFilterBar from '../features/community-library/components/CommunityFilterBar.vue';
import CommunityCreateDialog from '../features/community-library/components/CommunityCreateDialog.vue';
import CommunityImportDialog from '../features/community-library/components/CommunityImportDialog.vue';
import CommunityDetailCard from '../features/community-library/components/CommunityDetailCard.vue';
import AppleButton from '../components/AppleButton.vue';
import type { CommunityGroupEntity } from '@content/shared';

const {
  loading,
  communities,
  pagination,
  filters,
  setPage,
  setPageSize,
  refresh,
  resetFilters,
  handleDelete,
  handleDisable,
  handleEnable
} = useCommunityLibrary();

// Residual #179/#186/#209: detail drawer + performance + packages + nested tasks.
const {
  drawerVisible: detailDrawerVisible,
  loading: detailLoading,
  community: detailCommunity,
  performance: detailPerformance,
  packages: detailPackages,
  packagesLoading: detailPackagesLoading,
  tasks: detailTasks,
  tasksTotal: detailTasksTotal,
  tasksPage: detailTasksPage,
  tasksPageSize: detailTasksPageSize,
  tasksLoading: detailTasksLoading,
  // Residual #271
  tasksWindowLabel: detailTasksWindowLabel,
  setTasksPage: setDetailTasksPage,
  open: openDetail
} = useCommunityDetail();

const createDialogVisible = ref(false);
const createSubmitting = ref(false);
const isEdit = ref(false);
const communityForm = reactive({
  groupName: '',
  groupType: 'wechat_group',
  areaId: '',
  // Residual #236: remaining DTO-ready areaName/ownerName/preferredCategories.
  areaName: '',
  memberCount: 0,
  // Residual #231: DTO-ready activityLevel + ownerPhone/note.
  activityLevel: '' as '' | 'high' | 'medium' | 'low',
  tags: [] as string[],
  preferredCategories: [] as string[],
  ownerId: '',
  ownerName: '',
  ownerPhone: '',
  source: '',
  note: ''
});
const editId = ref<string | null>(null);

const importDialogVisible = ref(false);
const importSubmitting = ref(false);

function handleSearch() {
  refresh();
}

function handleReset() {
  resetFilters({
    groupType: '',
    areaId: '',
    activityLevel: '',
    isActive: undefined,
    keyword: ''
  });
  refresh();
}

function resetCommunityForm() {
  communityForm.groupName = '';
  communityForm.groupType = 'wechat_group';
  communityForm.areaId = '';
  communityForm.areaName = '';
  communityForm.memberCount = 0;
  communityForm.activityLevel = '';
  communityForm.tags = [];
  communityForm.preferredCategories = [];
  communityForm.ownerId = '';
  communityForm.ownerName = '';
  communityForm.ownerPhone = '';
  communityForm.source = '';
  communityForm.note = '';
}

function toCommunityWritePayload() {
  // Empty optional strings → undefined so API whitelist does not store blanks.
  return {
    groupName: communityForm.groupName,
    groupType: communityForm.groupType,
    areaId: communityForm.areaId,
    areaName: communityForm.areaName.trim() || undefined,
    memberCount: communityForm.memberCount,
    activityLevel: communityForm.activityLevel || undefined,
    tags: communityForm.tags,
    preferredCategories:
      communityForm.preferredCategories.length > 0 ? communityForm.preferredCategories : undefined,
    ownerId: communityForm.ownerId.trim() || undefined,
    ownerName: communityForm.ownerName.trim() || undefined,
    ownerPhone: communityForm.ownerPhone.trim() || undefined,
    source: communityForm.source.trim() || undefined,
    note: communityForm.note.trim() || undefined
  };
}

function openCreateDialog() {
  isEdit.value = false;
  editId.value = null;
  resetCommunityForm();
  createDialogVisible.value = true;
}

async function submitCreate() {
  createSubmitting.value = true;
  try {
    const payload = toCommunityWritePayload();
    if (isEdit.value && editId.value) {
      await api.updateCommunity(editId.value, payload);
      ElMessage.success('社群已更新');
    } else {
      await api.createCommunity(payload);
      ElMessage.success('社群已创建');
    }
    createDialogVisible.value = false;
    refresh();
  } finally {
    createSubmitting.value = false;
  }
}

function handleView(community: CommunityGroupEntity) {
  // Residual #179: was pure no-op; open drawer + fetch scoped performance.
  void openDetail(community);
}

function handleEdit(community: CommunityGroupEntity) {
  isEdit.value = true;
  editId.value = community.groupId;
  communityForm.groupName = community.groupName;
  communityForm.groupType = community.groupType;
  communityForm.areaId = community.areaId;
  communityForm.areaName = community.areaName || '';
  communityForm.memberCount = community.memberCount;
  communityForm.activityLevel =
    community.activityLevel === 'high' ||
    community.activityLevel === 'medium' ||
    community.activityLevel === 'low'
      ? community.activityLevel
      : '';
  communityForm.tags = [...(community.tags ?? [])];
  communityForm.preferredCategories = [...(community.preferredCategories ?? [])];
  communityForm.ownerId = community.ownerId || '';
  communityForm.ownerName = community.ownerName || '';
  // Residual #258: list/detail return maskPhone — never seed edit with masked value
  // (would write ****1234 back as the real ownerPhone). Leave blank = keep existing.
  communityForm.ownerPhone = '';
  communityForm.source = community.source || '';
  communityForm.note = community.note || '';
  createDialogVisible.value = true;
}

function openImportDialog() {
  importDialogVisible.value = true;
}

async function submitImport(data: { source: 'csv' | 'json'; rawData: string }) {
  importSubmitting.value = true;
  try {
    await api.importCommunities(data);
    ElMessage.success('社群导入成功');
    importDialogVisible.value = false;
    refresh();
  } finally {
    importSubmitting.value = false;
  }
}
</script>

<style scoped>
.community-library-page {
  padding: 0;
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

.header-actions {
  display: flex;
  gap: 8px;
}
</style>

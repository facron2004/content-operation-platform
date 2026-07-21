<template>
  <section class="page-stack community-library-page">
    <div class="page-header">
      <h2>社群库</h2>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog()">新建社群</el-button>
        <el-button :icon="Upload" @click="openImportDialog()">批量导入</el-button>
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
  </section>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Upload } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { useCommunityLibrary } from '../features/community-library/composables/useCommunityLibrary';
import CommunityLibraryTable from '../features/community-library/components/CommunityLibraryTable.vue';
import CommunityFilterBar from '../features/community-library/components/CommunityFilterBar.vue';
import CommunityCreateDialog from '../features/community-library/components/CommunityCreateDialog.vue';
import CommunityImportDialog from '../features/community-library/components/CommunityImportDialog.vue';
import type { CommunityGroupEntity } from '@content/shared';

const router = useRouter();

const {
  loading,
  communities,
  pagination,
  filters,
  setPage,
  setPageSize,
  refresh,
  handleDelete,
  handleDisable
} = useCommunityLibrary();

const createDialogVisible = ref(false);
const createSubmitting = ref(false);
const isEdit = ref(false);
const communityForm = reactive({
  groupName: '',
  groupType: 'wechat_group',
  areaId: '',
  memberCount: 0,
  tags: [] as string[],
  ownerId: '',
  source: ''
});
const editId = ref<string | null>(null);

const importDialogVisible = ref(false);
const importSubmitting = ref(false);

function handleSearch() {
  refresh();
}

function handleReset() {
  filters.value = {
    groupType: '',
    areaId: '',
    activityLevel: '',
    isActive: undefined,
    keyword: ''
  };
  refresh();
}

function openCreateDialog() {
  isEdit.value = false;
  editId.value = null;
  communityForm.groupName = '';
  communityForm.groupType = 'wechat_group';
  communityForm.areaId = '';
  communityForm.memberCount = 0;
  communityForm.tags = [];
  communityForm.ownerId = '';
  communityForm.source = '';
  createDialogVisible.value = true;
}

async function submitCreate() {
  createSubmitting.value = true;
  try {
    if (isEdit.value && editId.value) {
      await api.updateCommunity(editId.value, communityForm);
      ElMessage.success('社群已更新');
    } else {
      await api.createCommunity(communityForm);
      ElMessage.success('社群已创建');
    }
    createDialogVisible.value = false;
    refresh();
  } finally {
    createSubmitting.value = false;
  }
}

function handleView(community: CommunityGroupEntity) {
  // Could navigate to detail page in the future
}

function handleEdit(community: CommunityGroupEntity) {
  isEdit.value = true;
  editId.value = community.groupId;
  communityForm.groupName = community.groupName;
  communityForm.groupType = community.groupType;
  communityForm.areaId = community.areaId;
  communityForm.memberCount = community.memberCount;
  communityForm.tags = [...community.tags];
  communityForm.ownerId = community.ownerId || '';
  communityForm.source = community.source || '';
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

.header-actions {
  display: flex;
  gap: 8px;
}
</style>

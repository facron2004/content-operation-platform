import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { CommunityGroupEntity } from '@content/shared';
import { api } from '../../../services/api';

export interface CommunityLibraryFilters {
  groupType: string;
  areaId: string;
  activityLevel: string;
  isActive?: boolean;
  keyword: string;
}

function createDefaultFilters(): CommunityLibraryFilters {
  return { groupType: '', areaId: '', activityLevel: '', isActive: undefined, keyword: '' };
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useCommunityLibrary() {
  const loading = ref(false);
  const communities = ref<CommunityGroupEntity[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const filters = ref<CommunityLibraryFilters>(createDefaultFilters());

  const pagination = computed(() => ({
    current: page.value,
    pageSize: pageSize.value,
    total: total.value
  }));

  async function loadCommunities(): Promise<void> {
    loading.value = true;
    try {
      const active = filters.value;
      const res = await api.listCommunities({
        groupType: active.groupType || undefined,
        areaId: active.areaId || undefined,
        activityLevel: active.activityLevel || undefined,
        isActive: active.isActive,
        keyword: active.keyword.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value
      });
      communities.value = res.items ?? [];
      total.value = res.total ?? 0;
    } catch (error) {
      communities.value = [];
      total.value = 0;
      ElMessage.error(resolveErrorMessage(error, '加载社群列表失败'));
    } finally {
      loading.value = false;
    }
  }

  function setPage(nextPage: number): void {
    page.value = nextPage;
    loadCommunities();
  }

  function setPageSize(nextPageSize: number): void {
    pageSize.value = nextPageSize;
    page.value = 1;
    loadCommunities();
  }

  function refresh(): void {
    page.value = 1;
    loadCommunities();
  }

  async function reloadCurrentPage(): Promise<void> {
    await loadCommunities();
    if (!communities.value.length && page.value > 1) {
      page.value -= 1;
      await loadCommunities();
    }
  }

  async function deleteCommunity(community: CommunityGroupEntity): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `确认删除社群「${community.groupName}」？此操作不可恢复。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
    try {
      await api.deleteCommunity(community.groupId);
      ElMessage.success('社群已删除');
      await reloadCurrentPage();
    } catch (error) {
      ElMessage.error(resolveErrorMessage(error, '删除社群失败'));
    }
  }

  async function disableCommunity(community: CommunityGroupEntity): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `确认停用社群「${community.groupName}」？停用后将不再参与分发。`,
        '停用确认',
        { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
    try {
      await api.disableCommunity(community.groupId);
      ElMessage.success('社群已停用');
      await loadCommunities();
    } catch (error) {
      ElMessage.error(resolveErrorMessage(error, '停用社群失败'));
    }
  }

  onMounted(loadCommunities);

  return {
    loading,
    communities,
    total,
    page,
    pageSize,
    filters,
    pagination,
    loadCommunities,
    setPage,
    setPageSize,
    refresh,
    deleteCommunity,
    disableCommunity,
    handleDelete: deleteCommunity,
    handleDisable: disableCommunity
  };
}

import { onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { CommunityGroupEntity } from '@content/shared';
import { api } from '../../../services/api';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';
import { usePagedList, type PagedListReturn } from '../../../composables/usePagedList';

export interface CommunityLibraryFilters {
  groupType: string;
  areaId: string;
  activityLevel: string;
  isActive?: boolean;
  keyword: string;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useCommunityLibrary(): PagedListReturn<
  CommunityGroupEntity,
  CommunityLibraryFilters
> & {
  deleteCommunity: (community: CommunityGroupEntity) => Promise<void>;
  disableCommunity: (community: CommunityGroupEntity) => Promise<void>;
} {
  const list = usePagedList<CommunityGroupEntity, CommunityLibraryFilters>(
    async ({ page, pageSize, filters }) => {
      const res = await api.listCommunities({
        groupType: filters.groupType || undefined,
        areaId: filters.areaId || undefined,
        activityLevel: filters.activityLevel || undefined,
        isActive: filters.isActive,
        keyword: filters.keyword.trim() || undefined,
        page,
        pageSize
      });
      return { items: res.items ?? [], total: res.total ?? 0 };
    },
    {
      groupType: '',
      areaId: '',
      activityLevel: '',
      isActive: undefined,
      keyword: ''
    } as CommunityLibraryFilters,
    {
      onError: (msg) => ElMessage.error(resolveErrorMessage(msg, '加载社群列表失败'))
    }
  );

  async function deleteCommunity(community: CommunityGroupEntity): Promise<void> {
    await confirmAndDelete(
      { message: `确认删除社群「${community.groupName}」？此操作不可恢复。` },
      () => api.deleteCommunity(community.groupId),
      { successMsg: '社群已删除', errorMsg: '删除社群失败', onSuccess: list.reloadCurrentPage }
    );
  }

  async function disableCommunity(community: CommunityGroupEntity): Promise<void> {
    await confirmAndDelete(
      {
        message: `确认停用社群「${community.groupName}」？停用后将不再参与分发。`,
        title: '停用确认',
        confirmButtonText: '停用',
        cancelButtonText: '取消'
      },
      () => api.disableCommunity(community.groupId),
      { successMsg: '社群已停用', errorMsg: '停用社群失败', onSuccess: list.load }
    );
  }

  onMounted(() => list.load());

  return { ...list, deleteCommunity, disableCommunity };
}

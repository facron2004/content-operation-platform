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
  communities: PagedListReturn<CommunityGroupEntity, CommunityLibraryFilters>['items'];
  deleteCommunity: (community: CommunityGroupEntity) => Promise<void>;
  disableCommunity: (community: CommunityGroupEntity) => Promise<void>;
  enableCommunity: (community: CommunityGroupEntity) => Promise<void>;
  handleDelete: (community: CommunityGroupEntity) => Promise<void>;
  handleDisable: (community: CommunityGroupEntity) => Promise<void>;
  handleEnable: (community: CommunityGroupEntity) => Promise<void>;
} {
  const list = usePagedList<CommunityGroupEntity, CommunityLibraryFilters>(
    async ({ page, pageSize, filters }) => {
      // Residual #196: API CommunityQueryDto expects isActive as 0|1 number;
      // boolean true/false becomes NaN under @Type(() => Number) and 400s/no-ops.
      const isActiveParam = filters.isActive === undefined ? undefined : filters.isActive ? 1 : 0;
      const res = await api.listCommunities({
        groupType: filters.groupType || undefined,
        areaId: filters.areaId || undefined,
        activityLevel: filters.activityLevel || undefined,
        isActive: isActiveParam,
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

  /** Residual #199: reverse soft-disable so inactive rows are not stuck. */
  async function enableCommunity(community: CommunityGroupEntity): Promise<void> {
    await confirmAndDelete(
      {
        message: `确认启用社群「${community.groupName}」？启用后可重新参与分发。`,
        title: '启用确认',
        confirmButtonText: '启用',
        cancelButtonText: '取消'
      },
      () => api.enableCommunity(community.groupId),
      { successMsg: '社群已启用', errorMsg: '启用社群失败', onSuccess: list.load }
    );
  }

  onMounted(() => list.load());

  return {
    ...list,
    communities: list.items,
    deleteCommunity,
    disableCommunity,
    enableCommunity,
    handleDelete: deleteCommunity,
    handleDisable: disableCommunity,
    handleEnable: enableCommunity
  };
}

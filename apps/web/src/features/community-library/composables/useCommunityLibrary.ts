import { onMounted, onScopeDispose, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { CommunityGroupEntity } from '@content/shared';
import { api } from '../../../services/api';
import type { CommunityWritePayload } from '../../../services/api/community-library.api';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';
import { usePagedList, type PagedListReturn } from '../../../composables/usePagedList';
import { resolveSubmissionIntent, type SubmissionIntent } from '../../../services/idempotency-key';

export interface CommunityLibraryFilters {
  groupType: string;
  areaId: string;
  activityLevel: string;
  isActive?: boolean;
  keyword: string;
}

export interface CommunityImportPayload {
  source: 'csv' | 'json';
  rawData: string;
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
  writeError: Ref<string | null>;
  createSubmitting: Ref<boolean>;
  importSubmitting: Ref<boolean>;
  saveCommunity: (editId: string | null, data: CommunityWritePayload) => Promise<boolean>;
  importCommunities: (data: CommunityImportPayload) => Promise<boolean>;
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

  const writeError = ref<string | null>(null);
  const createSubmitting = ref(false);
  const importSubmitting = ref(false);
  let disposed = false;
  let writeRequestId = 0;
  let importIntent: SubmissionIntent | null = null;

  function isCurrentWrite(requestId: number): boolean {
    return !disposed && requestId === writeRequestId;
  }

  async function saveCommunity(
    editId: string | null,
    data: CommunityWritePayload
  ): Promise<boolean> {
    if (disposed || createSubmitting.value || importSubmitting.value) return false;
    const requestId = ++writeRequestId;
    writeError.value = null;
    createSubmitting.value = true;
    try {
      if (editId) {
        await api.updateCommunity(editId, data);
      } else {
        await api.createCommunity(data);
      }
    } catch (error) {
      if (isCurrentWrite(requestId)) {
        writeError.value = resolveErrorMessage(
          error,
          editId ? '更新社群失败，请稍后重试' : '创建社群失败，请稍后重试'
        );
      }
      return false;
    } finally {
      if (isCurrentWrite(requestId)) createSubmitting.value = false;
    }
    if (!isCurrentWrite(requestId)) return false;
    ElMessage.success(editId ? '社群已更新' : '社群已创建');
    list.refresh();
    return true;
  }

  async function importCommunities(data: CommunityImportPayload): Promise<boolean> {
    if (disposed || createSubmitting.value || importSubmitting.value) return false;
    const requestId = ++writeRequestId;
    writeError.value = null;
    importSubmitting.value = true;
    try {
      importIntent = resolveSubmissionIntent('batch-import', data, importIntent);
      await api.importCommunities(data, importIntent.key);
    } catch (error) {
      if (isCurrentWrite(requestId)) {
        writeError.value = resolveErrorMessage(error, '社群导入失败，请检查数据格式');
      }
      return false;
    } finally {
      if (isCurrentWrite(requestId)) importSubmitting.value = false;
    }
    if (!isCurrentWrite(requestId)) return false;
    importIntent = null;
    ElMessage.success('社群导入成功');
    list.refresh();
    return true;
  }

  async function deleteCommunity(community: CommunityGroupEntity): Promise<void> {
    if (disposed) return;
    writeError.value = null;
    await confirmAndDelete(
      { message: `确认删除社群「${community.groupName}」？此操作不可恢复。` },
      () => (disposed ? Promise.resolve() : api.deleteCommunity(community.groupId)),
      {
        successMsg: '社群已删除',
        errorMsg: '删除社群失败',
        isActive: () => !disposed,
        onSuccess: () => list.reloadCurrentPage(),
        onError: (message) => {
          if (!disposed) writeError.value = message;
        }
      }
    );
  }

  async function disableCommunity(community: CommunityGroupEntity): Promise<void> {
    if (disposed) return;
    writeError.value = null;
    await confirmAndDelete(
      {
        message: `确认停用社群「${community.groupName}」？停用后将不再参与分发。`,
        title: '停用确认',
        confirmButtonText: '停用',
        cancelButtonText: '取消'
      },
      () => (disposed ? Promise.resolve() : api.disableCommunity(community.groupId)),
      {
        successMsg: '社群已停用',
        errorMsg: '停用社群失败',
        isActive: () => !disposed,
        onSuccess: () => list.load(),
        onError: (message) => {
          if (!disposed) writeError.value = message;
        }
      }
    );
  }

  /** Residual #199: reverse soft-disable so inactive rows are not stuck. */
  async function enableCommunity(community: CommunityGroupEntity): Promise<void> {
    if (disposed) return;
    writeError.value = null;
    await confirmAndDelete(
      {
        message: `确认启用社群「${community.groupName}」？启用后可重新参与分发。`,
        title: '启用确认',
        confirmButtonText: '启用',
        cancelButtonText: '取消'
      },
      () => (disposed ? Promise.resolve() : api.enableCommunity(community.groupId)),
      {
        successMsg: '社群已启用',
        errorMsg: '启用社群失败',
        isActive: () => !disposed,
        onSuccess: () => list.load(),
        onError: (message) => {
          if (!disposed) writeError.value = message;
        }
      }
    );
  }

  onMounted(() => list.load());

  onScopeDispose(() => {
    disposed = true;
    writeRequestId += 1;
    createSubmitting.value = false;
    importSubmitting.value = false;
  }, true);

  return {
    ...list,
    communities: list.items,
    deleteCommunity,
    disableCommunity,
    enableCommunity,
    handleDelete: deleteCommunity,
    handleDisable: disableCommunity,
    handleEnable: enableCommunity,
    writeError,
    createSubmitting,
    importSubmitting,
    saveCommunity,
    importCommunities
  };
}

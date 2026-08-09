import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import { usePagedList } from '../../composables/usePagedList';
import { useIamMutation } from '../iam/useIamMutation';
import type { UserFormPayload, UserRow } from './types';

export function useUserManagement() {
  const { items, loading, error, pagination, filters, load, setPage, reloadCurrentPage } =
    usePagedList<UserRow, { keyword: string; isActive?: boolean }>(
      async ({ page, pageSize, filters: currentFilters }) => {
        const isActive =
          currentFilters.isActive === undefined ? undefined : currentFilters.isActive ? 1 : 0;
        const data = await api.listUsers({
          page,
          pageSize,
          keyword: currentFilters.keyword.trim() || undefined,
          isActive
        });
        const rows = (data.items ?? data.data ?? []) as UserRow[];
        return { items: rows, total: data.total ?? 0 };
      },
      { keyword: '', isActive: undefined },
      {
        filterDebounceMs: 300,
        onError: (message) => ElMessage.error(extractErrorMessage(message, '加载用户列表失败'))
      }
    );

  const formVisible = ref(false);
  const editingUser = ref<UserRow | null>(null);
  const accessVisible = ref(false);
  const accessUser = ref<UserRow | null>(null);
  const writeError = ref<string | null>(null);
  const {
    saving: submitting,
    run: runUserMutation,
    invalidate: invalidateUserMutation
  } = useIamMutation();
  const { run: runStatusMutation } = useIamMutation();

  const isEdit = computed(() => Boolean(editingUser.value));

  async function handleSearch(): Promise<void> {
    await load(true);
  }

  function openCreate() {
    invalidateUserMutation();
    writeError.value = null;
    editingUser.value = null;
    formVisible.value = true;
  }

  function handleEdit(row: UserRow) {
    invalidateUserMutation();
    writeError.value = null;
    editingUser.value = row;
    formVisible.value = true;
  }

  function openAccess(row: UserRow) {
    accessUser.value = row;
    accessVisible.value = true;
  }

  watch(formVisible, (visible) => {
    if (!visible) invalidateUserMutation();
  });

  async function submitUser(payload: UserFormPayload) {
    if (submitting.value) return;
    writeError.value = null;
    const editingUserId = editingUser.value?.userId;
    const isEditing = Boolean(editingUserId);
    const snapshot: UserFormPayload = {
      ...payload,
      roles: payload.roles?.map((role) => ({ ...role }))
    };
    try {
      let saved = false;
      if (editingUserId) {
        const { username: _username, roles: _roles, ...updatePayload } = snapshot;
        saved = await runUserMutation(() => api.updateUser(editingUserId, updatePayload));
      } else {
        saved = await runUserMutation(() => api.createUser(snapshot));
      }
      if (!saved || !formVisible.value || editingUser.value?.userId !== editingUserId) return;
      ElMessage.success(isEditing ? '用户已更新' : '用户已创建');
      formVisible.value = false;
      await (isEditing ? reloadCurrentPage() : load(true));
    } catch (error) {
      writeError.value = extractErrorMessage(error, isEditing ? '更新失败' : '创建失败');
      ElMessage.error(writeError.value);
    }
  }

  async function handleDeactivate(row: UserRow) {
    writeError.value = null;
    const userId = row.userId;
    try {
      const saved = await runStatusMutation(() => api.deactivateUser(userId));
      if (!saved) return;
      ElMessage.success('用户已停用');
      await reloadCurrentPage();
    } catch (error) {
      writeError.value = extractErrorMessage(error, '停用失败');
      ElMessage.error(writeError.value);
    }
  }

  async function handleActivate(row: UserRow) {
    writeError.value = null;
    const userId = row.userId;
    try {
      const saved = await runStatusMutation(() => api.updateUser(userId, { isActive: true }));
      if (!saved) return;
      ElMessage.success('用户已启用');
      await reloadCurrentPage();
    } catch (error) {
      writeError.value = extractErrorMessage(error, '启用失败');
      ElMessage.error(writeError.value);
    }
  }

  async function handleAccessSaved() {
    accessVisible.value = false;
    await reloadCurrentPage();
  }

  onMounted(() => load());

  return {
    items,
    loading,
    error,
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
  };
}

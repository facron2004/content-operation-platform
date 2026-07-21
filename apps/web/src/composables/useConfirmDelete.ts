import { ElMessage, ElMessageBox } from 'element-plus';
import { extractErrorMessage } from '../services/http-client';

export interface ConfirmDeleteOptions {
  message: string;
  title?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

/**
 * 弹出确认对话框，确认后执行 deleteFn，成功弹出 successMsg 并调用 onSuccess。
 * 用户取消或执行失败时弹出错误。
 * 返回值标记是否执行成功（用户取消也视为 false）。
 */
export async function confirmAndDelete(
  confirmOptions: ConfirmDeleteOptions,
  deleteFn: () => Promise<unknown>,
  options?: {
    successMsg?: string;
    errorMsg?: string;
    onSuccess?: () => void | Promise<void>;
  }
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(confirmOptions.message, confirmOptions.title ?? '删除确认', {
      type: 'warning',
      confirmButtonText: confirmOptions.confirmButtonText ?? '删除',
      cancelButtonText: confirmOptions.cancelButtonText ?? '取消'
    });
  } catch {
    return false;
  }

  try {
    await deleteFn();
    ElMessage.success(options?.successMsg ?? '删除成功');
    await options?.onSuccess?.();
    return true;
  } catch (err) {
    ElMessage.error(extractErrorMessage(err, options?.errorMsg ?? '删除失败'));
    return false;
  }
}

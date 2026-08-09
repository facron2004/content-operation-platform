import { ElMessage, ElMessageBox } from 'element-plus';
import type { Ref } from 'vue';
import type { RuleConfig, RuleType } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { formatTime, ruleTypeLabels } from '../../../utils/labels';
import {
  alwaysCurrent,
  prettyJson,
  SETTINGS_ACTIVE_OPTIONS,
  SETTINGS_TYPE_OPTIONS,
  type SettingsRequestGuard,
  type SettingsState
} from './settings-read';

async function createRuleVersion(
  params: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  },
  isCurrent: SettingsRequestGuard = alwaysCurrent
): Promise<boolean> {
  if (!isCurrent()) return false;
  if (!params.name.trim()) {
    ElMessage.warning('请填写规则名称');
    return false;
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(params.payloadText);
  } catch {
    ElMessage.error('payload 不是合法 JSON');
    return false;
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    ElMessage.error('payload 必须是 JSON 对象');
    return false;
  }
  await api.createRule({
    merchantId: params.merchantId.trim() || undefined,
    type: params.type,
    name: params.name.trim(),
    payload,
    comment: params.comment.trim() || undefined
  });
  if (isCurrent()) ElMessage.success('已创建新版本（默认未生效，请手动激活）');
  return true;
}

async function activateRuleVersion(
  row: RuleConfig,
  isCurrent: SettingsRequestGuard = alwaysCurrent
): Promise<void> {
  if (!isCurrent()) return;
  await api.activateRule(row.id);
  if (isCurrent()) ElMessage.success(`已激活：${row.name} v${row.version}`);
}

async function deleteRuleVersion(
  row: RuleConfig,
  isCurrent: SettingsRequestGuard = alwaysCurrent
): Promise<boolean> {
  if (!isCurrent()) return false;
  try {
    await ElMessageBox.confirm(`确认删除「${row.name} v${row.version}」？`, '删除确认', {
      type: 'warning'
    });
  } catch {
    return false;
  }
  if (!isCurrent()) return false;
  await api.deleteRule(row.id);
  if (isCurrent()) ElMessage.success('已删除');
  return true;
}

export async function runSettingsCreate(options: {
  submitting: Ref<boolean>;
  writeError?: Ref<string | null>;
  dialogVisible: Ref<boolean>;
  dialogForm: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  };
  reload: () => Promise<void>;
  isCurrent?: SettingsRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? alwaysCurrent;
  if (!isCurrent() || options.submitting.value) return;
  const snapshot = { ...options.dialogForm };
  if (options.writeError) options.writeError.value = null;
  options.submitting.value = true;
  try {
    const ok = await createRuleVersion(snapshot, isCurrent);
    if (!ok || !isCurrent()) return;
    options.dialogVisible.value = false;
    await options.reload();
  } catch (error) {
    if (isCurrent()) {
      if (options.writeError) {
        options.writeError.value = extractErrorMessage(error, '创建规则失败，请稍后重试');
      }
    }
  } finally {
    if (isCurrent()) options.submitting.value = false;
  }
}

export async function runSettingsActivate(
  row: RuleConfig,
  reload: () => Promise<void>,
  options: {
    isCurrent?: SettingsRequestGuard;
    mutating?: Ref<boolean>;
    writeError?: Ref<string | null>;
  } = {}
) {
  const isCurrent = options.isCurrent ?? alwaysCurrent;
  if (!isCurrent() || options.mutating?.value) return;
  if (options.writeError) options.writeError.value = null;
  if (options.mutating) options.mutating.value = true;
  try {
    await activateRuleVersion(row, isCurrent);
    if (!isCurrent()) return;
    await reload();
  } catch (error) {
    if (isCurrent()) {
      if (options.writeError) {
        options.writeError.value = extractErrorMessage(error, '激活规则失败，请稍后重试');
      }
    }
  } finally {
    if (isCurrent() && options.mutating) options.mutating.value = false;
  }
}

export async function runSettingsRemove(
  row: RuleConfig,
  reload: () => Promise<void>,
  options: {
    isCurrent?: SettingsRequestGuard;
    mutating?: Ref<boolean>;
    writeError?: Ref<string | null>;
  } = {}
) {
  const isCurrent = options.isCurrent ?? alwaysCurrent;
  if (!isCurrent() || options.mutating?.value) return;
  if (options.writeError) options.writeError.value = null;
  if (options.mutating) options.mutating.value = true;
  try {
    const ok = await deleteRuleVersion(row, isCurrent);
    if (ok && isCurrent()) await reload();
  } catch (error) {
    if (isCurrent()) {
      if (options.writeError) {
        options.writeError.value = extractErrorMessage(error, '删除规则失败，请稍后重试');
      }
    }
  } finally {
    if (isCurrent() && options.mutating) options.mutating.value = false;
  }
}

export function openSettingsCreateDialog(options: {
  dialogForm: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  };
  defaults: Record<string, unknown>;
  dialogVisible: Ref<boolean>;
}) {
  options.dialogForm.merchantId = '';
  options.dialogForm.type = 'promotion';
  options.dialogForm.name = '';
  options.dialogForm.comment = '';
  options.dialogForm.payloadText = prettyJson(options.defaults.promotion ?? {});
  options.dialogVisible.value = true;
}

function createSettingsHandlers(args: {
  dialogForm: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  };
  defaults: Ref<Record<string, unknown>>;
  writeError: Ref<string | null>;
  dialogVisible: Ref<boolean>;
  submitting: Ref<boolean>;
  isCurrent: SettingsRequestGuard;
  reload: () => Promise<void>;
}) {
  const setPayload = () => {
    args.dialogForm.payloadText = prettyJson(args.defaults.value[args.dialogForm.type] ?? {});
  };
  return {
    openCreate: () =>
      openSettingsCreateDialog({
        dialogForm: args.dialogForm,
        defaults: args.defaults.value,
        dialogVisible: args.dialogVisible
      }),
    onTypeChange: setPayload,
    loadDefaultPayload: setPayload,
    submitCreate: () =>
      runSettingsCreate({
        submitting: args.submitting,
        dialogVisible: args.dialogVisible,
        dialogForm: args.dialogForm,
        reload: args.reload,
        isCurrent: args.isCurrent,
        writeError: args.writeError
      })
  };
}

export function buildUseSettingsReturn(
  state: SettingsState,
  load: () => Promise<void>,
  isCurrent: SettingsRequestGuard = alwaysCurrent
) {
  return {
    ...state,
    typeOptions: SETTINGS_TYPE_OPTIONS,
    isActiveOptions: SETTINGS_ACTIVE_OPTIONS,
    ruleTypeLabels,
    pretty: prettyJson,
    formatTime,
    load,
    ...createSettingsHandlers({
      dialogForm: state.dialogForm,
      defaults: state.defaults,
      writeError: state.writeError,
      dialogVisible: state.dialogVisible,
      submitting: state.submitting,
      isCurrent,
      reload: load
    }),
    activate: (row: RuleConfig) =>
      runSettingsActivate(row, load, {
        isCurrent,
        mutating: state.mutating,
        writeError: state.writeError
      }),
    remove: (row: RuleConfig) =>
      runSettingsRemove(row, load, {
        isCurrent,
        mutating: state.mutating,
        writeError: state.writeError
      })
  };
}

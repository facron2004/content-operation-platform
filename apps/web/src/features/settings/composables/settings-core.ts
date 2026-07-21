import { reactive, ref, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { RuleConfig, RuleType } from '@content/shared';
import { api } from '../../../services/api';
import { formatTime, ruleTypeLabels } from '../../../utils/labels';

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const SETTINGS_TYPE_OPTIONS = Object.entries(ruleTypeLabels).map(([value, label]) => ({
  value,
  label
}));

export const SETTINGS_ACTIVE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '全部', value: '' },
  { label: '生效中', value: 'true' },
  { label: '未生效', value: 'false' }
];

export function createSettingsState() {
  return {
    loading: ref(false),
    rules: ref<RuleConfig[]>([]),
    total: ref(0),
    page: ref(1),
    pageSize: ref(20),
    filters: reactive({
      merchantId: '',
      type: '' as '' | RuleType,
      isActive: '' as '' | 'true' | 'false'
    }),
    defaults: ref<Record<string, unknown>>({}),
    defaultsVisible: ref(false),
    dialogVisible: ref(false),
    submitting: ref(false),
    dialogForm: reactive({
      merchantId: '',
      type: 'promotion' as RuleType,
      name: '',
      payloadText: '',
      comment: ''
    })
  };
}

export async function loadSettingsRules(options: {
  loading: Ref<boolean>;
  rules: Ref<RuleConfig[]>;
  total: Ref<number>;
  page: number;
  pageSize: number;
  filters: { merchantId: string; type: '' | RuleType; isActive: '' | 'true' | 'false' };
}) {
  options.loading.value = true;
  try {
    const data = await api.listRules({
      merchantId: options.filters.merchantId || undefined,
      type: options.filters.type || undefined,
      isActive: options.filters.isActive ? options.filters.isActive === 'true' : undefined,
      page: options.page,
      pageSize: options.pageSize
    });
    options.rules.value = data.items;
    options.total.value = data.pagination.total;
  } catch {
    /* interceptor already surfaces errors */
  } finally {
    options.loading.value = false;
  }
}

export async function loadSettingsDefaults(defaults: Ref<Record<string, unknown>>) {
  try {
    defaults.value = await api.getRuleDefaults();
  } catch {
    /* optional baseline panel */
  }
}

async function createRuleVersion(params: {
  merchantId: string;
  type: RuleType;
  name: string;
  payloadText: string;
  comment: string;
}): Promise<boolean> {
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
    comment: params.comment.trim() || undefined,
    createdBy: 'web'
  });
  ElMessage.success('已创建新版本（默认未生效，请手动激活）');
  return true;
}

async function activateRuleVersion(row: RuleConfig): Promise<void> {
  await api.activateRule(row.id);
  ElMessage.success(`已激活：${row.name} v${row.version}`);
}

async function deleteRuleVersion(row: RuleConfig): Promise<boolean> {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name} v${row.version}」？`, '删除确认', {
      type: 'warning'
    });
  } catch {
    return false;
  }
  await api.deleteRule(row.id);
  ElMessage.success('已删除');
  return true;
}

export async function runSettingsLoad(options: {
  loading: Ref<boolean>;
  rules: Ref<RuleConfig[]>;
  total: Ref<number>;
  page: number;
  pageSize: number;
  filters: { merchantId: string; type: '' | RuleType; isActive: '' | 'true' | 'false' };
}) {
  await loadSettingsRules(options);
}

export async function runSettingsCreate(options: {
  submitting: Ref<boolean>;
  dialogVisible: Ref<boolean>;
  dialogForm: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  };
  reload: () => Promise<void>;
}) {
  options.submitting.value = true;
  try {
    const ok = await createRuleVersion(options.dialogForm);
    if (!ok) return;
    options.dialogVisible.value = false;
    await options.reload();
  } catch {
    /* interceptor already surfaces errors */
  } finally {
    options.submitting.value = false;
  }
}

export async function runSettingsActivate(row: RuleConfig, reload: () => Promise<void>) {
  try {
    await activateRuleVersion(row);
    await reload();
  } catch {
    /* interceptor surfaces */
  }
}

export async function runSettingsRemove(row: RuleConfig, reload: () => Promise<void>) {
  try {
    const ok = await deleteRuleVersion(row);
    if (ok) await reload();
  } catch {
    /* interceptor surfaces */
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

// --- handlers / public return builder ---
type SettingsState = ReturnType<typeof createSettingsState>;

function createSettingsHandlers(args: {
  dialogForm: {
    merchantId: string;
    type: RuleType;
    name: string;
    payloadText: string;
    comment: string;
  };
  defaults: Ref<Record<string, unknown>>;
  dialogVisible: Ref<boolean>;
  submitting: Ref<boolean>;
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
        reload: args.reload
      })
  };
}

export function buildUseSettingsReturn(state: SettingsState, load: () => Promise<void>) {
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
      dialogVisible: state.dialogVisible,
      submitting: state.submitting,
      reload: load
    }),
    activate: (row: RuleConfig) => runSettingsActivate(row, load),
    remove: (row: RuleConfig) => runSettingsRemove(row, load)
  };
}

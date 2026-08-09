import { reactive, ref, type Ref } from 'vue';
import type { RuleConfig, RuleType } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { ruleTypeLabels } from '../../../utils/labels';

export type SettingsRequestGuard = () => boolean;

export const alwaysCurrent: SettingsRequestGuard = () => true;

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
    loadError: ref<string | null>(null),
    writeError: ref<string | null>(null),
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
    defaultsError: ref<string | null>(null),
    defaultsVisible: ref(false),
    dialogVisible: ref(false),
    submitting: ref(false),
    mutating: ref(false),
    dialogForm: reactive({
      merchantId: '',
      type: 'promotion' as RuleType,
      name: '',
      payloadText: '',
      comment: ''
    })
  };
}

export type SettingsState = ReturnType<typeof createSettingsState>;

export async function loadSettingsRules(options: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
  rules: Ref<RuleConfig[]>;
  total: Ref<number>;
  page: number;
  pageSize: number;
  filters: { merchantId: string; type: '' | RuleType; isActive: '' | 'true' | 'false' };
  isCurrent?: SettingsRequestGuard;
}) {
  const isCurrent = options.isCurrent ?? alwaysCurrent;
  if (!isCurrent()) return;
  options.loading.value = true;
  options.loadError.value = null;
  try {
    const data = await api.listRules({
      merchantId: options.filters.merchantId || undefined,
      type: options.filters.type || undefined,
      isActive: options.filters.isActive ? options.filters.isActive === 'true' : undefined,
      page: options.page,
      pageSize: options.pageSize
    });
    if (!isCurrent()) return;
    options.rules.value = data.items;
    options.total.value = data.pagination.total;
  } catch (error) {
    if (isCurrent()) {
      options.loadError.value = extractErrorMessage(error, '规则列表加载失败，请稍后重试');
    }
  } finally {
    if (isCurrent()) options.loading.value = false;
  }
}

export async function loadSettingsDefaults(
  defaults: Ref<Record<string, unknown>>,
  isCurrent: SettingsRequestGuard = alwaysCurrent,
  defaultsError?: Ref<string | null>
) {
  if (!isCurrent()) return;
  if (defaultsError) defaultsError.value = null;
  try {
    const nextDefaults = await api.getRuleDefaults();
    if (isCurrent()) defaults.value = nextDefaults;
  } catch (error) {
    if (isCurrent() && defaultsError) {
      defaultsError.value = extractErrorMessage(error, '规则默认值加载失败，请稍后重试');
    }
  }
}

export async function runSettingsLoad(options: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
  rules: Ref<RuleConfig[]>;
  total: Ref<number>;
  page: number;
  pageSize: number;
  filters: { merchantId: string; type: '' | RuleType; isActive: '' | 'true' | 'false' };
  isCurrent?: SettingsRequestGuard;
}) {
  await loadSettingsRules(options);
}

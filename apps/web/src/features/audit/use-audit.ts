import { computed, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { AuditStatus, Channel, GeneratedCopy } from '@content/shared';
import { api } from '../../services/api';
import {
  auditChannelOptions,
  auditStatusOptions,
  loadAuditCopies,
  submitAuditCopy
} from './audit-actions';
import { extractErrorMessage } from '../../services/http-client';

const ALLOWED_AUDIT_STATUS = new Set(auditStatusOptions.map((o) => o.value));
const ALLOWED_CHANNEL = new Set(
  auditChannelOptions.map((o) => o.value).filter((v): v is Channel => Boolean(v))
);

const DEFAULT_PAGE_SIZE = 20;

export function useAudit() {
  const route = useRoute();
  // Residual #213: dashboard content-funnel deep-link seeds ?status=pending|approved|risk.
  const seedStatus = String(route.query.status ?? '');
  const initialStatus = (
    ALLOWED_AUDIT_STATUS.has(seedStatus) ? seedStatus : 'pending'
  ) as AuditStatus;
  // Residual #215: optional ?channel=wechat_group|moments|merchant_share deep-link.
  const seedChannel = String(route.query.channel ?? '');
  const initialChannel = (ALLOWED_CHANNEL.has(seedChannel as Channel) ? seedChannel : '') as
    Channel | '';

  const loading = ref(false),
    loadError = ref<string | null>(null),
    detailError = ref<string | null>(null),
    actionError = ref<string | null>(null),
    auditSubmitting = ref(false),
    status = ref<AuditStatus>(initialStatus),
    channel = ref<Channel | ''>(initialChannel),
    copies = ref<GeneratedCopy[]>([]),
    selected = ref<GeneratedCopy | null>(null),
    // Residual #218: surface API listCopies pagination (was silently truncated at page 1).
    page = ref(1),
    pageSize = ref(DEFAULT_PAGE_SIZE),
    total = ref(0),
    // Residual #270: INTERACTIVE_LIST_MAX_DAYS window from listCopies pagination.
    dateFrom = ref<string | undefined>(),
    dateTo = ref<string | undefined>(),
    draft = reactive({ title: '', body: '', auditRemark: '' });
  // Residual #270: prefer API window; fallback label matches INTERACTIVE_LIST_MAX_DAYS.
  const windowLabel = computed(() => {
    if (dateFrom.value && dateTo.value) return `${dateFrom.value} ~ ${dateTo.value}`;
    return '近 90 天';
  });
  let disposed = false;
  let loadRequestId = 0;
  let detailRequestId = 0;
  let auditRequestId = 0;

  onScopeDispose(() => {
    disposed = true;
    loadRequestId += 1;
    detailRequestId += 1;
    auditRequestId += 1;
    loading.value = false;
    auditSubmitting.value = false;
    actionError.value = null;
  }, true);

  const load = async () => {
    if (disposed) return;
    const requestId = ++loadRequestId;
    const selectedIdAtRequest = selected.value?.contentId;
    loading.value = true;
    loadError.value = null;
    try {
      const data = await loadAuditCopies(
        status.value,
        selectedIdAtRequest,
        channel.value,
        page.value,
        pageSize.value
      );
      if (disposed || requestId !== loadRequestId) return;
      copies.value = data.items;
      total.value = data.total;
      page.value = data.page;
      pageSize.value = data.pageSize;
      dateFrom.value = data.dateFrom;
      dateTo.value = data.dateTo;
      if (!data.keepSelected && selected.value?.contentId === selectedIdAtRequest) {
        selected.value = null;
        detailError.value = null;
      }
    } catch (error) {
      if (!disposed && requestId === loadRequestId) {
        loadError.value = extractErrorMessage(error, '审核队列加载失败');
      }
      throw error;
    } finally {
      if (!disposed && requestId === loadRequestId) loading.value = false;
    }
  };
  // List payload omits body/cta; hydrate full row on select for the audit editor.
  const selectCopy = async (copy: GeneratedCopy | null) => {
    if (disposed) return;
    const requestId = ++detailRequestId;
    detailError.value = null;
    actionError.value = null;
    if (selected.value?.contentId !== copy?.contentId) {
      auditRequestId += 1;
      auditSubmitting.value = false;
    }
    if (!copy) {
      selected.value = null;
      draft.title = '';
      draft.body = '';
      draft.auditRemark = '';
      return;
    }
    selected.value = copy;
    draft.title = copy.title ?? '';
    draft.body = copy.body ?? '';
    draft.auditRemark = copy.auditRemark ?? '';
    try {
      const full = await api.getCopy(copy.contentId);
      if (disposed || selected.value?.contentId !== full.contentId) return;
      selected.value = full;
      draft.title = full.title ?? '';
      draft.body = full.body ?? '';
      draft.auditRemark = full.auditRemark ?? '';
    } catch (error) {
      if (
        !disposed &&
        requestId === detailRequestId &&
        selected.value?.contentId === copy.contentId
      ) {
        detailError.value = extractErrorMessage(error, '文案详情加载失败');
      }
    }
  };
  const audit = async (auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>) => {
    if (disposed || auditSubmitting.value || !selected.value) return;
    const contentId = selected.value.contentId;
    const draftSnapshot = { ...draft };
    const requestId = ++auditRequestId;
    const isCurrent = () =>
      !disposed && requestId === auditRequestId && selected.value?.contentId === contentId;
    auditSubmitting.value = true;
    actionError.value = null;
    try {
      if (
        await submitAuditCopy(contentId, auditStatus, draftSnapshot, {
          isCurrent,
          onError: (error) => {
            if (!isCurrent()) return;
            actionError.value = extractErrorMessage(error, '审核结果保存失败');
          }
        })
      ) {
        if (!isCurrent()) return;
        try {
          await load();
        } catch {
          // The audit write succeeded; the queue refresh owns its own loadError state.
        }
      }
    } finally {
      if (requestId === auditRequestId) auditSubmitting.value = false;
    }
  };
  // Residual #218: filter changes must reset to page 1 or the queue looks empty.
  const onStatusChange = async (value: string) => {
    status.value = value as AuditStatus;
    page.value = 1;
    await load();
  };
  const onChannelChange = async (value: string) => {
    channel.value = (value ?? '') as Channel | '';
    page.value = 1;
    await load();
  };
  const onPageChange = async (next: number) => {
    page.value = next;
    await load();
  };
  const onPageSizeChange = async (next: number) => {
    pageSize.value = next;
    page.value = 1;
    await load();
  };
  onMounted(() => {
    void load().catch(() => undefined);
  });
  return {
    loading,
    loadError,
    detailError,
    actionError,
    submitting: auditSubmitting,
    status,
    channel,
    copies,
    selected,
    draft,
    page,
    pageSize,
    total,
    // Residual #270
    dateFrom,
    dateTo,
    windowLabel,
    statusOptions: auditStatusOptions,
    channelOptions: auditChannelOptions,
    load,
    selectCopy,
    audit,
    onStatusChange,
    onChannelChange,
    onPageChange,
    onPageSizeChange
  };
}

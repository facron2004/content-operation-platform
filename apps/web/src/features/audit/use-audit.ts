import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { AuditStatus, Channel, GeneratedCopy } from '@content/shared';
import { api } from '../../services/api';
import {
  auditChannelOptions,
  auditStatusOptions,
  loadAuditCopies,
  submitAuditCopy
} from './audit-actions';

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
  const load = async () => {
    loading.value = true;
    try {
      const data = await loadAuditCopies(
        status.value,
        selected.value?.contentId,
        channel.value,
        page.value,
        pageSize.value
      );
      copies.value = data.items;
      total.value = data.total;
      page.value = data.page;
      pageSize.value = data.pageSize;
      dateFrom.value = data.dateFrom;
      dateTo.value = data.dateTo;
      if (!data.keepSelected) selected.value = null;
    } finally {
      loading.value = false;
    }
  };
  // List payload omits body/cta; hydrate full row on select for the audit editor.
  const selectCopy = async (copy: GeneratedCopy | null) => {
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
      if (selected.value?.contentId !== full.contentId) return;
      selected.value = full;
      draft.title = full.title ?? '';
      draft.body = full.body ?? '';
      draft.auditRemark = full.auditRemark ?? '';
    } catch {
      /* interceptor surfaces; keep list projection */
    }
  };
  const audit = async (auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>) => {
    if (!selected.value) return;
    if (await submitAuditCopy(selected.value.contentId, auditStatus, draft)) await load();
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
  onMounted(load);
  return {
    loading,
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

import { onMounted, reactive, ref } from 'vue';
import type { AuditStatus, GeneratedCopy } from '@content/shared';
import { auditStatusOptions, loadAuditCopies, submitAuditCopy } from './audit-actions';
export function useAudit() {
  const loading = ref(false),
    status = ref<AuditStatus>('pending'),
    copies = ref<GeneratedCopy[]>([]),
    selected = ref<GeneratedCopy | null>(null),
    draft = reactive({ title: '', body: '', auditRemark: '' });
  const load = async () => {
    loading.value = true;
    try {
      const data = await loadAuditCopies(status.value, selected.value?.contentId);
      copies.value = data.items;
      if (!data.keepSelected) selected.value = null;
    } finally {
      loading.value = false;
    }
  };
  const selectCopy = (copy: GeneratedCopy | null) => {
    selected.value = copy;
    draft.title = copy?.title ?? '';
    draft.body = copy?.body ?? '';
    draft.auditRemark = copy?.auditRemark ?? '';
  };
  const audit = async (auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>) => {
    if (!selected.value) return;
    if (await submitAuditCopy(selected.value.contentId, auditStatus, draft)) await load();
  };
  onMounted(load);
  return {
    loading,
    status,
    copies,
    selected,
    draft,
    statusOptions: auditStatusOptions,
    load,
    selectCopy,
    audit
  };
}

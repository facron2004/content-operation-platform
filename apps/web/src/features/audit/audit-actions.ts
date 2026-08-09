import { ElMessage } from 'element-plus';
import type { AuditStatus, Channel, GeneratedCopy } from '@content/shared';
import { api } from '../../services/api';
import { auditStatusLabels, channelLabels } from '../../utils/labels';
export type AuditDraft = { title: string; body: string; auditRemark: string };
type AuditSubmitOptions = { isCurrent?: () => boolean; onError?: (error: unknown) => void };
export const auditStatusOptions = (Object.entries(auditStatusLabels) as Array<[string, string]>)
  .filter(([value]) => value !== 'draft')
  .map(([value, label]) => ({ label, value }));
// Residual #215: channel filter options (API ListCopiesQueryDto.channel already applied).
export const auditChannelOptions: Array<{ label: string; value: '' | Channel }> = [
  { label: '全部渠道', value: '' },
  ...(Object.entries(channelLabels) as Array<[Channel, string]>).map(([value, label]) => ({
    label,
    value
  }))
];
export async function loadAuditCopies(
  status: AuditStatus,
  selectedId?: string,
  channel?: Channel | '',
  // Residual #218: page through API pagination (default pageSize 20 server-side).
  page = 1,
  pageSize = 20
): Promise<{
  items: GeneratedCopy[];
  keepSelected: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // Residual #270: listCopies already projects INTERACTIVE_LIST_MAX_DAYS window.
  dateFrom?: string;
  dateTo?: string;
}> {
  const data = await api.listCopies({
    auditStatus: status,
    // Residual #215: forward channel when set (whitelist strip would drop undeclared keys).
    channel: channel || undefined,
    page,
    pageSize
  });
  return {
    items: data.items,
    keepSelected: !!selectedId && data.items.some((copy) => copy.contentId === selectedId),
    page: data.pagination.page,
    pageSize: data.pagination.pageSize,
    total: data.pagination.total,
    totalPages: data.pagination.totalPages,
    // Residual #270
    dateFrom: data.pagination.dateFrom,
    dateTo: data.pagination.dateTo
  };
}
export async function submitAuditCopy(
  contentId: string,
  auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>,
  draft: AuditDraft,
  options: AuditSubmitOptions = {}
): Promise<boolean> {
  const isCurrent = options.isCurrent ?? (() => true);
  if (!draft.title.trim() || !draft.body.trim()) {
    if (isCurrent()) ElMessage.warning('标题和正文不能为空');
    return false;
  }
  try {
    await api.auditCopy(contentId, {
      auditStatus,
      title: draft.title,
      body: draft.body,
      auditRemark: draft.auditRemark || (auditStatus === 'approved' ? '通过' : '')
    });
    if (!isCurrent()) return false;
    ElMessage.success(
      `审核结果已保存：${auditStatus === 'approved' ? '通过' : auditStatus === 'rejected' ? '驳回' : '标记为风险'}`
    );
    return true;
  } catch (error) {
    if (isCurrent()) options.onError?.(error);
    return false;
  }
}

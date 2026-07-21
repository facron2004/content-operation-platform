import { ElMessage } from 'element-plus';
import type { AuditStatus, GeneratedCopy } from '@content/shared';
import { api } from '../../services/api';
import { auditStatusLabels } from '../../utils/labels';
export type AuditDraft = { title: string; body: string; auditRemark: string };
export const auditStatusOptions = (Object.entries(auditStatusLabels) as Array<[string, string]>)
  .filter(([value]) => value !== 'draft')
  .map(([value, label]) => ({ label, value }));
export async function loadAuditCopies(
  status: AuditStatus,
  selectedId?: string
): Promise<{ items: GeneratedCopy[]; keepSelected: boolean }> {
  const data = await api.listCopies({ auditStatus: status });
  return {
    items: data.items,
    keepSelected: !!selectedId && data.items.some((copy) => copy.contentId === selectedId)
  };
}
export async function submitAuditCopy(
  contentId: string,
  auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>,
  draft: AuditDraft
): Promise<boolean> {
  if (!draft.title.trim() || !draft.body.trim()) {
    ElMessage.warning('标题和正文不能为空');
    return false;
  }
  try {
    await api.auditCopy(contentId, {
      auditStatus,
      title: draft.title,
      body: draft.body,
      auditRemark: draft.auditRemark || (auditStatus === 'approved' ? '通过' : '')
    });
    ElMessage.success(
      `审核结果已保存：${auditStatus === 'approved' ? '通过' : auditStatus === 'rejected' ? '驳回' : '标记为风险'}`
    );
    return true;
  } catch {
    return false;
  }
}

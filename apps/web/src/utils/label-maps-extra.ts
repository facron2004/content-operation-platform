import type { TagType } from './label-tag-types';
export const ruleTypeLabels: Record<string, string> = {
  promotion: '推广评分',
  copy: '文案审核',
  inventory: '库存规则',
  alert: '预警规则'
};
export const auditStatusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '通过',
  rejected: '驳回',
  risk: '风险'
};
export const groupTypeLabels: Record<string, string> = {
  office: '办公人群',
  parent_child: '亲子家庭',
  foodie: '吃喝群',
  merchant: '商家群',
  wellness: '休闲养生',
  mixed: '综合群'
};
export const levelTagType: Record<string, TagType> = {
  S: 'success',
  A: 'primary',
  B: 'warning',
  C: 'info',
  D: 'danger'
};

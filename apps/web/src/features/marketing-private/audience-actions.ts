export function canManageMarketingAudiences(permissions: readonly string[]) {
  return permissions.includes('campaigns:write');
}

export function audienceRecalculateLabel(audienceType: string) {
  return audienceType === 'SNAPSHOT' ? '更新快照' : '重新计算';
}

export function audienceRecalculateSuccessMessage(audienceType: string) {
  return audienceType === 'SNAPSHOT' ? '人群快照已更新' : '动态人群已重新计算';
}

import type { CommunityGroup, OperationCard } from '@content/shared';
const TIME_SLOTS: Record<string, string[]> = {
  office: ['12:00', '18:00'],
  parent_child: ['10:00', '15:30'],
  foodie: ['11:30', '17:30'],
  merchant: ['09:30', '14:00'],
  wellness: ['14:00', '20:00'],
  mixed: ['11:00', '17:00']
};
export function plannedTimeForGroup(groupType: string, index: number): string {
  const slots = TIME_SLOTS[groupType] ?? TIME_SLOTS.mixed;
  return slots[index % slots.length];
}
export function buildCommunityPushRows(communities: CommunityGroup[]) {
  return communities.flatMap((group) => {
    const pkg: OperationCard | undefined = group.todayRecommendedPackages?.[0];
    if (!pkg) return [];
    return [
      {
        groupName: group.groupName,
        packageName: pkg.packageName,
        plannedTime: plannedTimeForGroup(group.groupType, 0),
        reason: pkg.reason,
        nextAction: pkg.nextAction
      }
    ];
  });
}

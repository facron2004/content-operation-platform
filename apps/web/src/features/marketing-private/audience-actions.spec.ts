import { describe, expect, it } from 'vitest';
import {
  audienceRecalculateLabel,
  audienceRecalculateSuccessMessage,
  canManageMarketingAudiences
} from './audience-actions';

describe('marketing audience actions', () => {
  it('only exposes audience writes to campaigns writers', () => {
    expect(canManageMarketingAudiences(['campaigns:read'])).toBe(false);
    expect(canManageMarketingAudiences(['campaigns:read', 'campaigns:write'])).toBe(true);
  });

  it('describes dynamic recalculation and snapshot replacement honestly', () => {
    expect(audienceRecalculateLabel('DYNAMIC')).toBe('重新计算');
    expect(audienceRecalculateSuccessMessage('DYNAMIC')).toBe('动态人群已重新计算');
    expect(audienceRecalculateLabel('SNAPSHOT')).toBe('更新快照');
    expect(audienceRecalculateSuccessMessage('SNAPSHOT')).toBe('人群快照已更新');
  });
});

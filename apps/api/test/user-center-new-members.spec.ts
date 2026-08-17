import { describe, expect, it } from 'vitest';
import {
  countNewMembersByCreatedAt,
  getNewMemberWindows,
  unavailableNewMemberSummary
} from '../src/user-center/user-center-new-members';

describe('user center new-member windows', () => {
  it('uses Beijing day boundaries, Monday week starts, and calendar month starts', () => {
    const now = new Date('2026-08-19T02:00:00.000Z');
    const result = countNewMembersByCreatedAt(
      [
        new Date('2026-08-18T15:59:59.999Z'),
        new Date('2026-08-18T16:00:00.000Z'),
        new Date('2026-08-16T15:59:59.999Z'),
        new Date('2026-08-16T16:00:00.000Z'),
        new Date('2026-07-31T15:59:59.999Z')
      ],
      now
    );

    expect(result).toMatchObject({
      newMembersToday: 1,
      newMembersThisWeek: 3,
      newMembersThisMonth: 4,
      newMembersBasis: 'firstSeenAt'
    });
  });

  it('ends the current windows at the next Beijing day boundary', () => {
    const windows = getNewMemberWindows(new Date('2026-08-19T02:00:00.000Z'));

    expect(windows.today).toEqual({
      start: new Date('2026-08-18T16:00:00.000Z'),
      end: new Date('2026-08-19T16:00:00.000Z')
    });
    expect(windows.thisWeek.start).toEqual(new Date('2026-08-16T16:00:00.000Z'));
    expect(windows.thisMonth.start).toEqual(new Date('2026-07-31T16:00:00.000Z'));
  });

  it('marks source-based counts unavailable before a completed directory snapshot exists', () => {
    expect(unavailableNewMemberSummary()).toEqual({
      newMembersToday: null,
      newMembersThisWeek: null,
      newMembersThisMonth: null,
      newMembersBasis: 'unavailable'
    });
  });
});

import {
  beijingDateKey,
  beijingDayRangeUtc,
  endOfMonthKey,
  shiftDateKey,
  startOfWeekKey
} from '@content/shared';

export type NewMemberSummaryBasis = 'sourceCreatedAt' | 'firstSeenAt' | 'unavailable';

export interface NewMemberSummary {
  newMembersToday: number | null;
  newMembersThisWeek: number | null;
  newMembersThisMonth: number | null;
  newMembersBasis: NewMemberSummaryBasis;
}

export interface NewMemberWindow {
  start: Date;
  end: Date;
}

export interface NewMemberWindows {
  today: NewMemberWindow;
  thisWeek: NewMemberWindow;
  thisMonth: NewMemberWindow;
}

function dayStart(dayKey: string): Date {
  return beijingDayRangeUtc(dayKey).start;
}

function range(startDay: string, endDayExclusive: string): NewMemberWindow {
  return {
    start: dayStart(startDay),
    end: dayStart(endDayExclusive)
  };
}

export function getNewMemberWindows(now = new Date()): NewMemberWindows {
  const today = beijingDateKey(now);
  const tomorrow = shiftDateKey(today, 1);
  const weekStart = startOfWeekKey(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = shiftDateKey(endOfMonthKey(today), 1);

  return {
    today: range(today, tomorrow),
    thisWeek: range(weekStart, tomorrow),
    thisMonth: range(monthStart, nextMonth)
  };
}

function countInWindow(
  createdAt: readonly (Date | null | undefined)[],
  window: NewMemberWindow
): number {
  return createdAt.reduce((count, value) => {
    if (!value || Number.isNaN(value.getTime())) return count;
    return value >= window.start && value < window.end ? count + 1 : count;
  }, 0);
}

export function countNewMembersByCreatedAt(
  createdAt: readonly (Date | null | undefined)[],
  now = new Date()
): NewMemberSummary {
  const windows = getNewMemberWindows(now);
  return {
    newMembersToday: countInWindow(createdAt, windows.today),
    newMembersThisWeek: countInWindow(createdAt, windows.thisWeek),
    newMembersThisMonth: countInWindow(createdAt, windows.thisMonth),
    newMembersBasis: 'firstSeenAt'
  };
}

export function unavailableNewMemberSummary(): NewMemberSummary {
  return {
    newMembersToday: null,
    newMembersThisWeek: null,
    newMembersThisMonth: null,
    newMembersBasis: 'unavailable'
  };
}

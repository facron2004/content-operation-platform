import {
  integralStateLabel,
  integralTypeLabel,
  type MemberIntegralRecord,
  type MemberIntegralRecordRaw
} from './member-integral.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(row: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return null;
}

function readNumber(row: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeMemberIntegralRecord(
  raw: MemberIntegralRecordRaw
): MemberIntegralRecord | null {
  const centerMember = asRecord(raw.centerMember);
  const id = readString(raw, 'id');
  const centerMemberId = readString(raw, 'centerMemberId') ?? readString(centerMember, 'id');
  if (!id || !centerMemberId) return null;

  const integralType = readNumber(raw, 'integralType') ?? 0;
  const state = readNumber(raw, 'state') ?? 0;
  return {
    id,
    centerMemberId,
    memberName: readString(raw, 'memberName') ?? readString(centerMember, 'nickName') ?? '',
    memberPhone: readString(raw, 'memberPhone') ?? readString(centerMember, 'phone') ?? '',
    memberCode: readString(raw, 'memberCode', 'code') ?? readString(centerMember, 'code') ?? '',
    inviteCode: readString(raw, 'inviteCode') ?? null,
    parentInviteCode: readString(raw, 'parentInviteCode', 'parentCode') ?? null,
    consumptionIntegral: readNumber(raw, 'consumptionIntegral') ?? 0,
    integralType,
    integralTypeLabel: integralTypeLabel(integralType),
    state,
    stateLabel: integralStateLabel(state),
    orderCode: readString(raw, 'orderCode', 'orderNo'),
    historyPrice: readNumber(raw, 'historyPrice'),
    remarks: readString(raw, 'remarks', 'remark') ?? '',
    status: readString(raw, 'status') ?? '',
    createDate: readString(raw, 'createDate') ?? '',
    updateDate: readString(raw, 'updateDate')
  };
}

export function normalizeMemberIntegralRecords(
  rows: MemberIntegralRecordRaw[]
): MemberIntegralRecord[] {
  return rows
    .map(normalizeMemberIntegralRecord)
    .filter((row): row is MemberIntegralRecord => Boolean(row));
}

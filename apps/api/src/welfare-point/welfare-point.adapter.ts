import {
  POINT_TYPE_LABELS,
  sourceTypeLabel,
  type WelfarePointRaw,
  type WelfarePointRecord
} from './welfare-point.types';

/** Parse a JeeSite "YYYY-MM-DD HH:mm:ss" string into epoch ms (UTC-safe enough
 *  for day-bucketing; JeeSite times are server-local but we only need day granularity). */
export function parseJeeSiteDate(value: string | null | undefined): number {
  if (!value) return 0;
  // Normalize to ISO by replacing the space with 'T'. Append Z so Date parses as UTC
  // consistently; day-bucketing uses the date portion which is stable for display.
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const ts = Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return Number.isNaN(ts) ? 0 : ts;
}

export function normalizeWelfarePointRecord(raw: WelfarePointRaw): WelfarePointRecord {
  const member = raw.centerMember ?? null;
  const pointType = raw.pointType === 2 ? 2 : 1;
  return {
    id: String(raw.id),
    centerMemberId: String(raw.centerMemberId ?? ''),
    memberName: member?.nickName ?? '',
    memberPhone: member?.phone ?? '',
    memberCode: member?.code ?? '',
    pointAmount: Number(raw.pointAmount ?? 0),
    pointType,
    pointTypeLabel: POINT_TYPE_LABELS[pointType] ?? String(pointType),
    sourceType: Number(raw.sourceType ?? 0),
    sourceTypeLabel: sourceTypeLabel(Number(raw.sourceType ?? 0)),
    orderNo: raw.orderNo ?? null,
    currentBalance: Number(raw.currentBalance ?? 0),
    expireTime: raw.expireTime ?? null,
    changeDesc: raw.changeDesc ?? '',
    status: String(raw.status ?? ''),
    createDate: raw.createDate ?? '',
    createDateTs: parseJeeSiteDate(raw.createDate),
    updateDate: raw.updateDate ?? ''
  };
}

export function normalizeWelfarePointList(rows: WelfarePointRaw[]): WelfarePointRecord[] {
  return (rows ?? []).map(normalizeWelfarePointRecord);
}

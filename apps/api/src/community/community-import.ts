import { BadRequestException } from '@nestjs/common';
import type { CreateCommunityDto } from './dto/create-community.dto';

const GROUP_TYPES = new Set(['wechat_group', 'moments', 'merchant_share']);
const MAX_ROWS = 200;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function parseTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .map((v) => asTrimmedString(v))
      .filter(Boolean)
      .slice(0, 50);
  }
  const raw = asTrimmedString(value);
  if (!raw) return undefined;
  return raw
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Normalize/validate a loose row into CreateCommunityDto. */
export function normalizeCommunityRow(row: Record<string, unknown>): CreateCommunityDto {
  const groupName = asTrimmedString(row.groupName ?? row.group_name ?? row.name);
  const groupType = asTrimmedString(row.groupType ?? row.group_type ?? row.type);
  const areaId = asTrimmedString(row.areaId ?? row.area_id ?? row.area);
  if (!groupName || !groupType || !areaId) {
    throw new BadRequestException('导入行缺少必填字段 groupName / groupType / areaId');
  }
  if (!GROUP_TYPES.has(groupType)) {
    throw new BadRequestException(`无效 groupType: ${groupType}`);
  }
  const memberRaw = row.memberCount ?? row.member_count ?? row.members;
  const memberCount =
    memberRaw === undefined || memberRaw === null || memberRaw === ''
      ? undefined
      : Number(memberRaw);
  if (
    memberCount !== undefined &&
    (!Number.isFinite(memberCount) || memberCount < 0 || memberCount > 1_000_000)
  ) {
    throw new BadRequestException(`无效 memberCount: ${String(memberRaw)}`);
  }
  return {
    groupName: groupName.slice(0, 200),
    groupType,
    areaId: areaId.slice(0, 100),
    areaName: asTrimmedString(row.areaName ?? row.area_name).slice(0, 100) || undefined,
    ownerId: asTrimmedString(row.ownerId ?? row.owner_id).slice(0, 64) || undefined,
    ownerName: asTrimmedString(row.ownerName ?? row.owner_name).slice(0, 100) || undefined,
    ownerPhone: asTrimmedString(row.ownerPhone ?? row.owner_phone).slice(0, 32) || undefined,
    memberCount,
    activityLevel: (() => {
      const level = asTrimmedString(row.activityLevel ?? row.activity_level);
      return level === 'high' || level === 'medium' || level === 'low' ? level : undefined;
    })(),
    tags: parseTags(row.tags),
    preferredCategories: parseTags(row.preferredCategories ?? row.preferred_categories),
    source: asTrimmedString(row.source).slice(0, 100) || undefined,
    note: asTrimmedString(row.note).slice(0, 1000) || undefined
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(raw: string): CreateCommunityDto[] {
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new BadRequestException('CSV 至少需要表头 + 1 行数据');
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  if (!headers.length) throw new BadRequestException('CSV 表头为空');
  const rows: CreateCommunityDto[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    rows.push(normalizeCommunityRow(obj));
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`单次导入不能超过 ${MAX_ROWS} 条社群`);
    }
  }
  return rows;
}

function parseJsonRows(raw: string): CreateCommunityDto[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('JSON 解析失败');
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!list) throw new BadRequestException('JSON 必须是社群对象数组');
  if (list.length > MAX_ROWS) {
    throw new BadRequestException(`单次导入不能超过 ${MAX_ROWS} 条社群`);
  }
  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`第 ${index + 1} 行不是对象`);
    }
    return normalizeCommunityRow(item as Record<string, unknown>);
  });
}

/** Normalize a programmatic array body into CreateCommunityDto[]. */
export function normalizeCommunityImportList(items: unknown[]): CreateCommunityDto[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestException('导入列表不能为空');
  }
  if (items.length > MAX_ROWS) {
    throw new BadRequestException(`单次导入不能超过 ${MAX_ROWS} 条社群`);
  }
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`第 ${index + 1} 行不是对象`);
    }
    return normalizeCommunityRow(item as Record<string, unknown>);
  });
}

/** Parse web client import payload { source, rawData } into CreateCommunityDto[]. */
export function parseCommunityImportPayload(
  source: 'csv' | 'json',
  rawData: string
): CreateCommunityDto[] {
  if (source !== 'csv' && source !== 'json') {
    throw new BadRequestException('source 必须是 csv 或 json');
  }
  const raw = (rawData ?? '').trim();
  if (!raw) throw new BadRequestException('导入内容不能为空');
  if (raw.length > 500_000) throw new BadRequestException('导入内容过大（上限 500KB）');
  const rows = source === 'csv' ? parseCsvRows(raw) : parseJsonRows(raw);
  if (!rows.length) throw new BadRequestException('没有可导入的社群行');
  return rows;
}

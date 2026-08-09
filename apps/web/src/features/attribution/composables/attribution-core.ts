import type {
  MoneyWireValue,
  UnmatchedOrder,
  UnmatchedOrdersResponse
} from '../../../services/api/attribution.api';

export const ATTRIBUTION_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

export const EMPTY_UNMATCHED_ORDERS: UnmatchedOrdersResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: ATTRIBUTION_PAGE_SIZE_OPTIONS[0],
  dateFrom: '',
  dateTo: ''
};

const STATUS_LABELS: Record<string, string> = {
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  refunded: '已退款',
  cancelled: '已取消'
};

export function attributionStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status || '未知');
}

export function attributionStatusTagType(
  status: string
): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'paid' || status === 'completed') return 'success';
  if (status === 'refunded') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'info';
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function moneyOf(value: unknown): MoneyWireValue {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return value.trim();
  return null;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function pageSizeOf(value: unknown): number {
  const parsed = nonNegativeInt(value, EMPTY_UNMATCHED_ORDERS.pageSize);
  return Math.min(200, Math.max(1, parsed));
}

function mapOrder(value: unknown): UnmatchedOrder | null {
  const raw = recordOf(value);
  const orderId = textOf(raw.orderId);
  if (!orderId) return null;
  return {
    orderId,
    memberId: textOf(raw.memberId),
    packageId: textOf(raw.packageId),
    orderAmountFen: moneyOf(raw.orderAmountFen),
    paidAmountFen: moneyOf(raw.paidAmountFen),
    orderAmountDisplay: textOf(raw.orderAmountDisplay) ?? undefined,
    paidAmountDisplay: textOf(raw.paidAmountDisplay) ?? undefined,
    orderTime: textOf(raw.orderTime) ?? '',
    status: textOf(raw.status) ?? 'unknown'
  };
}

export function mapUnmatchedOrdersResponse(value: unknown): UnmatchedOrdersResponse {
  const raw = recordOf(value);
  const items = Array.isArray(raw.items)
    ? raw.items.map(mapOrder).filter((item): item is UnmatchedOrder => item !== null)
    : [];
  return {
    items,
    total: nonNegativeInt(raw.total, items.length),
    page: Math.max(1, nonNegativeInt(raw.page, EMPTY_UNMATCHED_ORDERS.page)),
    pageSize: pageSizeOf(raw.pageSize),
    dateFrom: textOf(raw.dateFrom) ?? '',
    dateTo: textOf(raw.dateTo) ?? ''
  };
}

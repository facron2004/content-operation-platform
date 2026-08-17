import { rowNumber, rowText, type AnyRecord } from '../content/jeesite-row-reader';

export interface PartnerPickupPointRecord {
  merchantId: string;
  merchantName: string;
  availablePointCenti: bigint;
  state: number;
  invalidPoint: boolean;
}

export interface PartnerPickupPointAggregate extends Omit<
  PartnerPickupPointRecord,
  'state' | 'invalidPoint'
> {
  recordCount: number;
  activeRecordCount: number;
  invalidPointRows: number;
}

export function parsePointCenti(value: unknown): bigint | null {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function mapPartnerPickupPointRow(row: AnyRecord): PartnerPickupPointRecord | null {
  const merchantId = rowText(row, [
    'corePartnerId',
    'corePartner.id',
    'merchantId',
    'partnerId',
    'partner.id'
  ]);
  if (!merchantId) return null;

  const rawPoint = rowText(row, ['availableCommodityPoint']);
  const parsedPoint = parsePointCenti(rawPoint);
  return {
    merchantId,
    merchantName:
      rowText(row, ['corePartner.name', 'merchantName', 'partnerName', 'corePartnerName']) ||
      merchantId,
    availablePointCenti: parsedPoint ?? 0n,
    state: rowNumber(row, ['state'], 0),
    invalidPoint: Boolean(rawPoint && parsedPoint === null)
  };
}

export function mergePartnerPickupPoint(
  target: PartnerPickupPointAggregate | undefined,
  row: PartnerPickupPointRecord
): PartnerPickupPointAggregate {
  const active = row.state === 1;
  return {
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    availablePointCenti:
      (target?.availablePointCenti ?? 0n) + (active ? row.availablePointCenti : 0n),
    recordCount: (target?.recordCount ?? 0) + 1,
    activeRecordCount: (target?.activeRecordCount ?? 0) + (active ? 1 : 0),
    invalidPointRows: (target?.invalidPointRows ?? 0) + (row.invalidPoint ? 1 : 0)
  };
}

export function aggregatePartnerPickupPointRows(rows: AnyRecord[]): {
  items: PartnerPickupPointAggregate[];
  skipped: number;
  errors: number;
} {
  const byMerchant = new Map<string, PartnerPickupPointAggregate>();
  let skipped = 0;
  for (const row of rows) {
    const mapped = mapPartnerPickupPointRow(row);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    byMerchant.set(
      mapped.merchantId,
      mergePartnerPickupPoint(byMerchant.get(mapped.merchantId), mapped)
    );
  }
  const items = [...byMerchant.values()];
  return {
    items,
    skipped,
    errors: items.reduce((sum, item) => sum + item.invalidPointRows, 0)
  };
}

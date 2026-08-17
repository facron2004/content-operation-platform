import { rowNumber, rowText, type AnyRecord } from '../content/jeesite-row-reader';

export const PARTNER_SHOP_SOURCE = 'jeesite_partner_shop';
export const PARTNER_SHOP_STORE_ID_PREFIX = 'jeesite:';

export interface PartnerShopMerchantFallback {
  merchantId: string;
  merchantName: string;
}

export interface PartnerShopRecord {
  externalShopId: string;
  merchantId: string;
  merchantName: string;
  storeName: string;
  address: string | null;
  areaId: string | null;
  areaName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  longitude: number | null;
  latitude: number | null;
  businessHours: string | null;
  status: 'active' | 'disabled';
}

const optionalText = (row: AnyRecord, keys: readonly string[]): string | null => {
  const value = rowText(row, keys);
  return value || null;
};

function optionalCoordinate(row: AnyRecord, keys: readonly string[], min: number, max: number) {
  const value = rowNumber(row, keys, Number.NaN);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function normalizeStatus(row: AnyRecord): 'active' | 'disabled' {
  const status = rowText(row, ['status']).trim().toLowerCase();
  const state = rowText(row, ['state']).trim().toLowerCase();
  if (['1', 'disabled', 'disable', 'inactive', 'closed', 'deleted'].includes(status)) {
    return 'disabled';
  }
  if (status === '0' || ['active', 'enabled', 'normal', 'open'].includes(status)) {
    return 'active';
  }
  return state === '0' || ['disabled', 'disable', 'inactive', 'closed'].includes(state)
    ? 'disabled'
    : 'active';
}

export function mapPartnerShopRow(
  row: AnyRecord,
  merchantFallback?: PartnerShopMerchantFallback
): PartnerShopRecord | null {
  const externalShopId = rowText(row, ['id', 'shopId', 'storeId', 'corePartnerShopId']);
  if (!externalShopId) return null;

  const merchantId =
    rowText(row, ['corePartnerId', 'merchantId', 'partnerId', 'corePartner.id', 'partner.id']) ||
    merchantFallback?.merchantId ||
    `external:${externalShopId}`;
  const storeName =
    rowText(row, ['name', 'shopName', 'storeName', 'corePartnerShopName']) || externalShopId;
  const merchantName =
    rowText(row, ['corePartner.name', 'merchantName', 'partnerName', 'corePartnerName']) ||
    merchantFallback?.merchantName ||
    storeName;

  return {
    externalShopId,
    merchantId,
    merchantName,
    storeName,
    address: optionalText(row, ['address', 'shopAddress', 'detailAddress']),
    areaId: optionalText(row, ['areaCode', 'areaId', 'districtCode']),
    areaName: optionalText(row, ['areaName', 'district', 'area']),
    contactName: optionalText(row, ['contactName', 'linkMan', 'contact', 'principal']),
    contactPhone: optionalText(row, ['phone', 'contactPhone', 'mobile']),
    longitude: optionalCoordinate(row, ['longitude', 'lng'], -180, 180),
    latitude: optionalCoordinate(row, ['latitude', 'lat'], -90, 90),
    businessHours: optionalText(row, ['businessHours', 'openingHours', 'businessDate']),
    status: normalizeStatus(row)
  };
}

export function partnerShopStoreId(externalShopId: string): string {
  return `${PARTNER_SHOP_STORE_ID_PREFIX}${externalShopId}`;
}

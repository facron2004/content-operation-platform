import { AREA_COORDINATES } from './area-coordinates';

/** 深圳九个行政区的中心点，用于无边界多边形数据时的最近中心点归属。 */
export const SHENZHEN_DISTRICT_NAMES = [
  '罗湖区',
  '福田区',
  '南山区',
  '宝安区',
  '龙岗区',
  '盐田区',
  '龙华区',
  '坪山区',
  '光明区'
] as const;

export type ShenzhenDistrictName = (typeof SHENZHEN_DISTRICT_NAMES)[number];

export const SHENZHEN_CITY_CENTER = AREA_COORDINATES['深圳市'];

const SHENZHEN_BOUNDS = {
  minLat: 22.43,
  maxLat: 22.86,
  minLng: 113.75,
  maxLng: 114.62
} as const;

export const SHENZHEN_DISTRICTS = SHENZHEN_DISTRICT_NAMES.map((name) => {
  const coordinate = AREA_COORDINATES[name];
  if (!coordinate) throw new Error(`Missing Shenzhen district coordinate: ${name}`);
  return { name, ...coordinate };
});

function isFiniteCoordinate(lat: number | null | undefined, lng: number | null | undefined) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * 深圳各区中心点的最近邻归属。
 *
 * 这是中心点近似，不等同于行政区边界多边形；范围外坐标返回 null，
 * 避免把东莞、惠州或兜底中心点强行算进深圳某个区。
 */
export function classifyShenzhenDistrict(
  lat: number | null | undefined,
  lng: number | null | undefined
): ShenzhenDistrictName | null {
  if (!isFiniteCoordinate(lat, lng)) return null;
  if (
    lat! < SHENZHEN_BOUNDS.minLat ||
    lat! > SHENZHEN_BOUNDS.maxLat ||
    lng! < SHENZHEN_BOUNDS.minLng ||
    lng! > SHENZHEN_BOUNDS.maxLng
  ) {
    return null;
  }

  // 在深圳范围内，按纬度/经度换算后的近似平面距离比较即可。
  const longitudeScale = Math.cos((SHENZHEN_CITY_CENTER.lat * Math.PI) / 180);
  let nearest: ShenzhenDistrictName | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const district of SHENZHEN_DISTRICTS) {
    const latDelta = lat! - district.lat;
    const lngDelta = (lng! - district.lng) * longitudeScale;
    const distance = latDelta * latDelta + lngDelta * lngDelta;
    if (distance < nearestDistance) {
      nearest = district.name;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** 当前 Merchant 表中的深圳市中心点是同步兜底值，不是店铺实测坐标。 */
export function isKnownShenzhenFallbackCoordinate(
  lat: number | null | undefined,
  lng: number | null | undefined
) {
  if (!isFiniteCoordinate(lat, lng)) return false;
  const latDelta = lat! - SHENZHEN_CITY_CENTER.lat;
  const lngDelta = lng! - SHENZHEN_CITY_CENTER.lng;
  return latDelta * latDelta + lngDelta * lngDelta <= 0.00005 ** 2;
}

/** 允许已有外部区域字段作为坐标缺失时的安全回退，但不把“深圳市”当作区。 */
export function normalizeShenzhenDistrictName(
  value: string | null | undefined
): ShenzhenDistrictName | null {
  const candidate = value?.trim().replace(/^深圳市/, '');
  return candidate && (SHENZHEN_DISTRICT_NAMES as readonly string[]).includes(candidate)
    ? (candidate as ShenzhenDistrictName)
    : null;
}

import { describe, expect, it } from 'vitest';
import {
  classifyShenzhenDistrict,
  isKnownShenzhenFallbackCoordinate,
  normalizeShenzhenDistrictName,
  SHENZHEN_CITY_CENTER,
  SHENZHEN_DISTRICTS
} from '../src/merchant/shenzhen-districts';

describe('Shenzhen coordinate district classification', () => {
  it('assigns each configured district center to itself', () => {
    for (const district of SHENZHEN_DISTRICTS) {
      expect(classifyShenzhenDistrict(district.lat, district.lng)).toBe(district.name);
    }
  });

  it('rejects missing and out-of-city coordinates', () => {
    expect(classifyShenzhenDistrict(null, 114.058)).toBeNull();
    expect(classifyShenzhenDistrict(23.129, 113.264)).toBeNull();
  });

  it('recognizes the current Shenzhen center fallback without treating it as a shop location', () => {
    expect(
      isKnownShenzhenFallbackCoordinate(SHENZHEN_CITY_CENTER.lat, SHENZHEN_CITY_CENTER.lng)
    ).toBe(true);
    expect(isKnownShenzhenFallbackCoordinate(22.548, 114.131)).toBe(false);
  });

  it('normalizes an existing Shenzhen district label for the no-coordinate fallback', () => {
    expect(normalizeShenzhenDistrictName('深圳市福田区')).toBe('福田区');
    expect(normalizeShenzhenDistrictName('深圳市')).toBeNull();
  });
});

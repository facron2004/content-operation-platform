import { describe, expect, it } from 'vitest';
import {
  mapPartnerShopRow,
  partnerShopStoreId,
  PARTNER_SHOP_SOURCE
} from '../src/gap-center/partner-shop.mapper';

describe('JeeSite partner shop mapping', () => {
  it('maps the corePartnerShop listData fields into a stable store record', () => {
    const result = mapPartnerShopRow({
      id: 'shop-1',
      corePartnerId: 'merchant-1',
      name: '海岸城店',
      district: '南山区',
      address: '南山区海岸城',
      areaCode: '440305',
      areaName: '广东省/深圳市/南山区',
      longitude: '113.937814',
      latitude: '22.51819',
      phone: '13800138000',
      status: '0',
      state: 1,
      corePartner: { id: 'merchant-1', name: '合作商' }
    });

    expect(result).toEqual({
      externalShopId: 'shop-1',
      merchantId: 'merchant-1',
      merchantName: '合作商',
      storeName: '海岸城店',
      address: '南山区海岸城',
      areaId: '440305',
      areaName: '广东省/深圳市/南山区',
      contactName: null,
      contactPhone: '13800138000',
      longitude: 113.937814,
      latitude: 22.51819,
      businessHours: null,
      status: 'active'
    });
    expect(partnerShopStoreId('shop-1')).toBe('jeesite:shop-1');
    expect(PARTNER_SHOP_SOURCE).toBe('jeesite_partner_shop');
  });

  it('uses the package shop mapping when the list row has no partner id', () => {
    expect(
      mapPartnerShopRow(
        { id: 'shop-2', name: '分店', status: '1', state: 0 },
        { merchantId: 'merchant-2', merchantName: '合作商 2' }
      )
    ).toEqual(
      expect.objectContaining({
        merchantId: 'merchant-2',
        merchantName: '合作商 2',
        status: 'disabled',
        longitude: null,
        latitude: null
      })
    );
  });

  it('skips rows without an external shop id', () => {
    expect(mapPartnerShopRow({ name: '没有 ID 的门店' })).toBeNull();
  });
});

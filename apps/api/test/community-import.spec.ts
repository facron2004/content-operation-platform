import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  normalizeCommunityImportList,
  normalizeCommunityRow,
  parseCommunityImportPayload
} from '../src/community/community-import';

describe('community-import', () => {
  describe('normalizeCommunityRow', () => {
    it('accepts camelCase required fields', () => {
      const row = normalizeCommunityRow({
        groupName: '测试群',
        groupType: 'wechat_group',
        areaId: 'area-1',
        memberCount: 12
      });
      expect(row.groupName).toBe('测试群');
      expect(row.groupType).toBe('wechat_group');
      expect(row.areaId).toBe('area-1');
      expect(row.memberCount).toBe(12);
    });

    it('accepts snake_case aliases', () => {
      const row = normalizeCommunityRow({
        group_name: '别名群',
        group_type: 'moments',
        area_id: 'a2',
        member_count: '8',
        tags: 'hot|vip'
      });
      expect(row.groupName).toBe('别名群');
      expect(row.groupType).toBe('moments');
      expect(row.areaId).toBe('a2');
      expect(row.memberCount).toBe(8);
      expect(row.tags).toEqual(['hot', 'vip']);
    });

    it('rejects missing required fields', () => {
      expect(() => normalizeCommunityRow({ groupName: 'x' })).toThrow(BadRequestException);
    });

    it('rejects invalid groupType', () => {
      expect(() =>
        normalizeCommunityRow({ groupName: 'x', groupType: 'telegram', areaId: 'a' })
      ).toThrow(BadRequestException);
    });
  });

  describe('parseCommunityImportPayload', () => {
    it('parses CSV with header', () => {
      const raw = ['groupName,groupType,areaId,memberCount', 'A群,wechat_group,area-1,10'].join(
        '\n'
      );
      const rows = parseCommunityImportPayload('csv', raw);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        groupName: 'A群',
        groupType: 'wechat_group',
        areaId: 'area-1',
        memberCount: 10
      });
    });

    it('parses JSON array', () => {
      const raw = JSON.stringify([
        { groupName: 'J群', groupType: 'merchant_share', areaId: 'area-9' }
      ]);
      const rows = parseCommunityImportPayload('json', raw);
      expect(rows).toHaveLength(1);
      expect(rows[0].groupType).toBe('merchant_share');
    });

    it('rejects empty payload', () => {
      expect(() => parseCommunityImportPayload('json', '   ')).toThrow(BadRequestException);
    });

    it('rejects invalid source', () => {
      expect(() =>
        parseCommunityImportPayload('xml' as 'csv', 'groupName,groupType,areaId\na,b,c')
      ).toThrow(BadRequestException);
    });

    it('caps bulk size', () => {
      const items = Array.from({ length: 201 }, (_, i) => ({
        groupName: `g${i}`,
        groupType: 'wechat_group',
        areaId: 'a'
      }));
      expect(() => parseCommunityImportPayload('json', JSON.stringify(items))).toThrow(
        BadRequestException
      );
    });
  });

  describe('normalizeCommunityImportList', () => {
    it('normalizes array body', () => {
      const rows = normalizeCommunityImportList([
        { groupName: 'L群', groupType: 'wechat_group', areaId: 'a1' }
      ]);
      expect(rows[0].groupName).toBe('L群');
    });

    it('rejects empty array', () => {
      expect(() => normalizeCommunityImportList([])).toThrow(BadRequestException);
    });
  });
});

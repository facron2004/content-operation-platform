import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RuleConfigRow } from '../src/content/rule-config.service';
import { RuleConfigService } from '../src/content/rule-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  DEFAULT_COPY_RULES,
  DEFAULT_INVENTORY_RULES,
  DEFAULT_PROMOTION_RULES
} from '../src/domain/rules-defaults';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const makeRow = (overrides: Partial<RuleConfigRow> = {}): RuleConfigRow =>
  ({
    id: 'R1',
    tenantId: null,
    merchantId: null,
    type: 'promotion',
    name: '默认',
    version: 1,
    isActive: true,
    payload: '{}',
    comment: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  }) as RuleConfigRow;

describe('RuleConfigService', () => {
  let service: RuleConfigService;

  let prisma: any;

  beforeEach(async () => {
    prisma = {
      ruleConfig: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        delete: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn()
      },
      // Merchant existence check on createRule with merchantId.
      $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
        if (sql.includes('FROM "Merchant"')) {
          const id = String(params[0] ?? '');
          // Tests use M1 as a known merchant; empty/null scope skips this path.
          return id ? [{ merchantId: id }] : [];
        }
        return [];
      }),
      // Interactive transaction shim: pass the same mocked client as `tx`.
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
    };
    const moduleRef = await Test.createTestingModule({
      providers: [RuleConfigService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(RuleConfigService);
  });

  describe('getEffectiveRules', () => {
    it('falls back to platform defaults when no config exists', async () => {
      prisma.ruleConfig.findFirst.mockResolvedValue(null);
      const promotion = await service.getEffectiveRules('promotion', 'M-X');
      expect(promotion).toEqual(DEFAULT_PROMOTION_RULES);
      // merchant 查询 + 平台默认查询
      expect(prisma.ruleConfig.findFirst).toHaveBeenCalledTimes(2);
    });

    it('caches resolved rules across calls (no extra DB hits)', async () => {
      prisma.ruleConfig.findFirst.mockResolvedValue(null);
      await service.getEffectiveRules('copy', 'M2');
      await service.getEffectiveRules('copy', 'M2');
      expect(prisma.ruleConfig.findFirst).toHaveBeenCalledTimes(2);
    });

    it('returns merchant active config merged with defaults (partial payload)', async () => {
      prisma.ruleConfig.findFirst.mockResolvedValueOnce(
        makeRow({
          merchantId: 'M1',
          type: 'promotion',
          isActive: true,
          payload: JSON.stringify({ scoreLevel: { s: 90, a: 75, b: 60, c: 45 } })
        })
      );
      const result = await service.getEffectiveRules('promotion', 'M1');
      expect(result.scoreLevel).toEqual({ s: 90, a: 75, b: 60, c: 45 });
      // 未覆盖字段回落默认
      expect(result.baseScoreByStockRatio).toEqual(DEFAULT_PROMOTION_RULES.baseScoreByStockRatio);
      expect(result.statusScoreDelta).toEqual(DEFAULT_PROMOTION_RULES.statusScoreDelta);
    });

    it('falls back to platform default when merchant has no active config', async () => {
      prisma.ruleConfig.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
        makeRow({
          merchantId: null,
          type: 'inventory',
          isActive: true,
          payload: JSON.stringify({ backlogDays: 12 })
        })
      );
      const result = await service.getEffectiveRules('inventory', 'M9');
      expect(result.backlogDays).toBe(12);
      expect(result.slowDays).toBe(DEFAULT_INVENTORY_RULES.slowDays);
    });

    it('returns platform defaults when no merchantId provided', async () => {
      prisma.ruleConfig.findFirst.mockResolvedValue(
        makeRow({ merchantId: null, type: 'copy', isActive: true, payload: '{}' })
      );
      const result = await service.getEffectiveRules('copy');
      expect(result).toEqual(DEFAULT_COPY_RULES);
    });
  });

  describe('createRule', () => {
    it('increments version and stays inactive by default', async () => {
      prisma.ruleConfig.findMany.mockResolvedValue([{ version: 2 }]);
      prisma.ruleConfig.create.mockImplementation(async (args: { data: Partial<RuleConfigRow> }) =>
        makeRow({ ...args.data, id: 'NEW' })
      );

      const created = await service.createRule({
        merchantId: 'M1',
        type: 'copy',
        name: '测试规则',
        payload: { forbiddenWords: ['便宜'] }
      });

      expect(created.version).toBe(3);
      expect(created.isActive).toBe(false);
      expect(created.merchantId).toBe('M1');
      expect(created.payload).toEqual({ forbiddenWords: ['便宜'] });

      const createArg = prisma.ruleConfig.create.mock.calls[0][0];
      expect(createArg.data.version).toBe(3);
      expect(createArg.data.isActive).toBe(false);
    });

    it('rejects createRule when merchantId does not exist', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(
        service.createRule({
          merchantId: 'ghost-m',
          type: 'copy',
          name: '幽灵商家规则',
          payload: {}
        })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.ruleConfig.create).not.toHaveBeenCalled();
    });

    it('treats empty merchantId as platform default (null)', async () => {
      prisma.ruleConfig.findMany.mockResolvedValue([]);
      prisma.ruleConfig.create.mockImplementation(async (args: { data: Partial<RuleConfigRow> }) =>
        makeRow({ ...args.data, id: 'NEW' })
      );
      const created = await service.createRule({
        merchantId: '',
        type: 'inventory',
        name: '平台规则',
        payload: {}
      });
      expect(created.merchantId).toBeNull();
    });

    it('rejects invalid promotion scoreLevel payload', async () => {
      prisma.ruleConfig.findMany.mockResolvedValue([]);
      await expect(
        service.createRule({
          merchantId: 'M1',
          type: 'promotion',
          name: 'bad',
          payload: { scoreLevel: { s: 90, a: 75, b: 60, c: 'x' } }
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('activateRule', () => {
    it('deactivates siblings and activates the target', async () => {
      const target = makeRow({ id: 'T1', merchantId: 'M1', type: 'inventory', isActive: false });
      prisma.ruleConfig.findUnique.mockResolvedValue(target);
      prisma.ruleConfig.update.mockResolvedValue(makeRow({ ...target, isActive: true }));

      const result = await service.activateRule('T1');
      expect(result.isActive).toBe(true);
      expect(prisma.ruleConfig.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: null, merchantId: 'M1', type: 'inventory', isActive: true },
          data: { isActive: false }
        })
      );
      expect(prisma.ruleConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'T1' },
          data: { isActive: true },
          select: expect.objectContaining({ id: true, isActive: true, version: true })
        })
      );
      // Residual #150: list projection — no payload on activate response.
      expect(prisma.ruleConfig.update.mock.calls[0][0].select.payload).toBeUndefined();
    });

    it('throws NotFoundException when target missing', async () => {
      prisma.ruleConfig.findUnique.mockResolvedValue(null);
      await expect(service.activateRule('X')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteRule', () => {
    it('deletes inactive target via isActive-pinned deleteMany', async () => {
      const row = makeRow({ id: 'D1', merchantId: 'M1', type: 'copy', isActive: false });
      prisma.ruleConfig.findUnique.mockResolvedValue(row);
      prisma.ruleConfig.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteRule('D1');
      expect(prisma.ruleConfig.deleteMany).toHaveBeenCalledWith({
        where: { id: 'D1', isActive: false }
      });
    });

    it('rejects deleting the currently active rule', async () => {
      const row = makeRow({ id: 'D2', merchantId: 'M1', type: 'copy', isActive: true });
      prisma.ruleConfig.findUnique.mockResolvedValue(row);
      await expect(service.deleteRule('D2')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ruleConfig.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target missing', async () => {
      prisma.ruleConfig.findUnique.mockResolvedValue(null);
      await expect(service.deleteRule('X')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getDefaults', () => {
    it('returns code baselines for all rule types', () => {
      const defaults = service.getDefaults();
      expect(defaults.promotion).toEqual(DEFAULT_PROMOTION_RULES);
      expect(defaults.copy).toEqual(DEFAULT_COPY_RULES);
      expect(defaults.inventory).toEqual(DEFAULT_INVENTORY_RULES);
    });
  });
});

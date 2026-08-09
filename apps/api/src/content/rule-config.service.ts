import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CacheEntry } from './rule-config-support';
import { ruleConfigDefaults } from './rule-config-support';
import {
  getRuleConfigById,
  listRuleConfigs,
  loadEffectiveRulesForMerchants,
  resolveEffectiveRules
} from './rule-config-read';
import {
  activateRuleAndInvalidate,
  createRuleAndInvalidate,
  deleteRuleAndInvalidate
} from './rule-config-write';
import { rethrowMissingRule } from './rule-config-support';

import type {
  CopyRuleConfig,
  InventoryRuleConfig,
  PromotionRuleConfig
} from '../domain/rules-defaults';
export interface TypedRuleConfig {
  promotion: PromotionRuleConfig;
  copy: CopyRuleConfig;
  inventory: InventoryRuleConfig;
  alert: Record<string, unknown>;
}

export type { RuleConfigRow } from './rule-config-support';
export { mapRuleConfig } from './rule-config-support';

export type CreateRuleInput = {
  merchantId?: string;
  type: RuleType;
  name: string;
  payload: RuleConfigPayload;
  comment?: string;
  createdBy?: string;
};

@Injectable()
export class RuleConfigService {
  private readonly logger = new Logger(RuleConfigService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /** Cold-path coalesce for concurrent merchant×type resolve (recommend storms). */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly cacheTtlMs = Number.parseInt(
    process.env.RULE_CONFIG_CACHE_TTL_MS ?? process.env.CONTENT_CACHE_TTL_MS ?? '60000',
    10
  );

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getEffectiveRules<K extends RuleType>(type: K, merchantId?: string) {
    return resolveEffectiveRules({
      prisma: this.prisma,
      cache: this.cache,
      cacheTtlMs: this.cacheTtlMs,
      type,
      merchantId,
      warn: (m: string) => this.logger.warn(m),
      inFlight: this.inFlight
    });
  }

  getEffectiveRulesForMerchants<K extends RuleType>(type: K, merchantIds: string[]) {
    return loadEffectiveRulesForMerchants(
      merchantIds,
      (t, id) => this.getEffectiveRules(t, id),
      type
    );
  }

  listRules(q: {
    merchantId?: string;
    type?: RuleType;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    return listRuleConfigs(this.prisma, q);
  }

  getRule(id: string): Promise<RuleConfig> {
    return getRuleConfigById(this.prisma, id);
  }

  getDefaults(): Record<RuleType, unknown> {
    return ruleConfigDefaults();
  }

  createRule(dto: CreateRuleInput): Promise<RuleConfig> {
    return createRuleAndInvalidate(this.prisma, this.cache, dto);
  }

  activateRule(id: string): Promise<RuleConfig> {
    return activateRuleAndInvalidate(this.prisma, this.cache, id).catch(rethrowMissingRule);
  }

  deleteRule(id: string): Promise<void> {
    return deleteRuleAndInvalidate(this.prisma, this.cache, id).catch(rethrowMissingRule);
  }
}

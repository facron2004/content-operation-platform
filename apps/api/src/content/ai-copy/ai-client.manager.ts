import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';
import type { AICopyStatus, AICopyConfigUpdate } from './types';
import { parseNumber } from './types';
import { assertHostnameNotPrivate, assertHostnameNotPrivateAsync } from '../jeesite-url';

@Injectable()
export class AIClientManager {
  private readonly logger = new Logger(AIClientManager.name);
  private client: OpenAI | null = null;
  private status: AICopyStatus;
  private apiKey: string | null = null;

  constructor(initialConfig: AICopyConfigUpdate) {
    this.status = this.applyConfig(initialConfig);
    if (!this.client) {
      this.logger.warn('AI copy generation disabled: AI_API_KEY is not configured');
    }
  }

  /** SSRF 防护：校验 AI baseURL 不指向私网/loopback/元数据服务 */
  private async assertBaseURLSafe(baseURL: string): Promise<void> {
    try {
      this.assertBaseURLSafeSync(baseURL);
      const hostname = new URL(baseURL).hostname;
      await assertHostnameNotPrivateAsync(hostname);
    } catch {
      throw new BadRequestException(`AI baseURL is not allowed: ${baseURL}`);
    }
  }

  /** Sync guard for constructor / applyConfig (no DNS await on boot). */
  private assertBaseURLSafeSync(baseURL: string): void {
    let hostname: string;
    try {
      const parsed = new URL(baseURL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`unsupported protocol ${parsed.protocol}`);
      }
      hostname = parsed.hostname;
    } catch {
      throw new BadRequestException(`AI baseURL is not allowed: ${baseURL}`);
    }
    try {
      assertHostnameNotPrivate(hostname);
    } catch {
      throw new BadRequestException(`AI baseURL is not allowed: ${baseURL}`);
    }
  }

  getClient(): OpenAI | null {
    return this.client;
  }

  getStatus(): AICopyStatus {
    return this.status;
  }

  async updateConfig(update: AICopyConfigUpdate): Promise<AICopyStatus> {
    const baseURL = this.normalizeText(update.baseURL) ?? this.status.baseURL;
    await this.assertBaseURLSafe(baseURL);
    this.status = this.applyConfig({
      apiKey: this.normalizeText(update.apiKey) ?? this.apiKey ?? undefined,
      baseURL,
      model: this.normalizeText(update.model) ?? this.status.model,
      providerName: this.normalizeText(update.providerName) ?? this.status.providerName,
      temperature: Math.min(
        2,
        Math.max(0, parseNumber(update.temperature, this.status.temperature))
      ),
      maxTokens: Math.round(
        Math.min(8000, Math.max(100, parseNumber(update.maxTokens, this.status.maxTokens)))
      )
    });
    return this.status;
  }

  private applyConfig(config: AICopyConfigUpdate): AICopyStatus {
    const apiKey = this.normalizeText(config.apiKey) ?? null;
    let baseURL = this.normalizeText(config.baseURL) ?? 'https://api.deepseek.com';
    let baseURLRejected = false;
    // Reject private/loopback baseURL from env at boot and from updates (sync path).
    try {
      this.assertBaseURLSafeSync(baseURL);
    } catch {
      this.logger.error(`AI baseURL rejected (SSRF guard): ${baseURL}`);
      // Never point the client at a private host. Fall back to public default and
      // disable the client so a misconfigured env cannot silently SSRF or call
      // an unintended provider with the configured key.
      baseURL = 'https://api.deepseek.com';
      baseURLRejected = true;
    }
    const model = this.normalizeText(config.model) ?? 'deepseek-chat';
    const providerName =
      this.normalizeText(config.providerName) ?? this.resolveProviderName(baseURL);
    const temperature = parseNumber(config.temperature, 0.7);
    const maxTokens = Math.round(parseNumber(config.maxTokens, 900));
    const missing: string[] = [];
    if (!apiKey) missing.push('AI_API_KEY');
    if (baseURLRejected) missing.push('AI_API_BASE_URL');

    this.apiKey = apiKey;
    // Disable client when key missing OR when the configured baseURL was private.
    this.client =
      apiKey && !baseURLRejected
        ? new OpenAI({
            apiKey,
            baseURL
          })
        : null;

    return {
      enabled: missing.length === 0,
      providerName,
      baseURL,
      model,
      missing,
      maskedApiKey: this.maskApiKey(apiKey),
      temperature,
      maxTokens
    };
  }

  private resolveProviderName(baseURL: string) {
    return baseURL.includes('deepseek') ? 'DeepSeek' : 'OpenAI-compatible';
  }

  private maskApiKey(apiKey: string | null) {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return '****';
    return `${apiKey.slice(0, 4)}**********${apiKey.slice(-4)}`;
  }

  private normalizeText(value: string | undefined | null) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || undefined;
  }
}

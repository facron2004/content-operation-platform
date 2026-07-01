import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { AICopyStatus, AICopyConfigUpdate } from './types';
import { parseNumber } from './types';

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

  getClient(): OpenAI | null {
    return this.client;
  }

  getStatus(): AICopyStatus {
    return this.status;
  }

  updateConfig(update: AICopyConfigUpdate): AICopyStatus {
    this.status = this.applyConfig({
      apiKey: this.normalizeText(update.apiKey) ?? this.apiKey ?? undefined,
      baseURL: this.normalizeText(update.baseURL) ?? this.status.baseURL,
      model: this.normalizeText(update.model) ?? this.status.model,
      providerName: this.normalizeText(update.providerName) ?? this.status.providerName,
      temperature: parseNumber(update.temperature, this.status.temperature),
      maxTokens: Math.round(parseNumber(update.maxTokens, this.status.maxTokens))
    });
    return this.status;
  }

  private applyConfig(config: AICopyConfigUpdate): AICopyStatus {
    const apiKey = this.normalizeText(config.apiKey) ?? null;
    const baseURL = this.normalizeText(config.baseURL) ?? 'https://api.deepseek.com';
    const model = this.normalizeText(config.model) ?? 'deepseek-chat';
    const providerName =
      this.normalizeText(config.providerName) ?? this.resolveProviderName(baseURL);
    const temperature = parseNumber(config.temperature, 0.7);
    const maxTokens = Math.round(parseNumber(config.maxTokens, 900));
    const missing = apiKey ? [] : ['AI_API_KEY'];

    this.apiKey = apiKey;
    this.client = apiKey
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

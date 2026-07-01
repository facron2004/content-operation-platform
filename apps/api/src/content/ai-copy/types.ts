export interface AICopyDraft {
  title: string;
  body: string;
  cta?: string;
}

export interface AICopyStatus {
  enabled: boolean;
  providerName: string;
  baseURL: string;
  model: string;
  missing: string[];
  maskedApiKey: string | null;
  temperature: number;
  maxTokens: number;
}

export interface AICopyConfigUpdate {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  providerName?: string;
  temperature?: number;
  maxTokens?: number;
}

/** 解析 number/string/undefined 为 number,失败时返回 fallback */
export const parseNumber = (value: string | number | undefined, fallback: number): number => {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

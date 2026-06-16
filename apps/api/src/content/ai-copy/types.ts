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

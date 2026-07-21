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
export interface AICopyConfigPayload {
  apiKey?: string;
  baseURL: string;
  model: string;
  providerName?: string;
  temperature: number;
  maxTokens: number;
}

import type { AICopyStatus as SharedAICopyStatus } from '@content/shared';

export interface AICopyDraft {
  title: string;
  body: string;
  cta?: string;
}

// 复用 shared 的权威定义,避免双份接口漂移。
// (AICopyConfigUpdate 仍保留本地版本:它的字段都是可选,而 shared 的
// AICopyConfigPayload 把 baseURL/model 设为必填,语义不同——用于部分更新。)
export type AICopyStatus = SharedAICopyStatus;

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

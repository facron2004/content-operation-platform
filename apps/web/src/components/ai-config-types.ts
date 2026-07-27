import type { Channel } from '@content/shared';
export interface GenerateForm {
  packageId: string;
  channel: Channel;
  // Residual #238: GenerateCopyDto.scenario optional string(200).
  scenario: string;
  tone: string;
  copyCount: number;
  extraInstruction: string;
}
export interface AIConfigForm {
  apiKey: string;
  baseURL: string;
  model: string;
  providerName: string;
  temperature: number;
  maxTokens: number;
}

<template>
  <section class="panel ai-control-panel">
    <SectionHeader
      title="AI文案接口"
      description="配置生成器、检查连通状态，并决定使用 AI 还是规则兜底。"
    >
      <template #actions>
        <el-tag :type="aiStatus?.enabled ? 'success' : 'danger'">
          {{ aiStatus?.enabled ? '已接入' : '未配置' }}
        </el-tag>
      </template>
    </SectionHeader>

    <div class="ai-status-card" :class="{ offline: aiStatus && !aiStatus.enabled }">
      <div>
        <strong>{{ aiStatus?.providerName ?? '读取中' }}</strong>
        <span>{{ aiStatus?.model ?? '-' }}</span>
        <small>{{ aiStatus?.baseURL ?? '-' }}</small>
        <small>Key：{{ aiStatus?.maskedApiKey ?? '未配置' }}</small>
      </div>
      <el-button size="small" :icon="Refresh" @click="$emit('refresh-status')">刷新</el-button>
    </div>

    <el-alert
      v-if="aiStatus && !aiStatus.enabled"
      type="warning"
      :closable="false"
      show-icon
      title="AI接口未配置"
      :description="`缺少 ${aiStatus.missing.join('、')}，配置后即可调用兼容接口生成。`"
    />

    <div class="config-box">
      <div class="config-head">
        <strong>接口配置</strong>
        <el-tag type="warning" effect="plain" size="small">仅本次运行生效，重启后需重新配置</el-tag>
      </div>
      <el-form label-position="top" class="config-form">
        <el-form-item label="API Base URL">
          <el-input v-model="configForm.baseURL" placeholder="https://api.deepseek.com" />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="configForm.model" placeholder="deepseek-chat" />
        </el-form-item>
        <el-form-item label="服务名">
          <el-input v-model="configForm.providerName" placeholder="DeepSeek" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="configForm.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="
              aiStatus?.maskedApiKey ? `当前：${aiStatus.maskedApiKey}` : '请输入 API Key'
            "
          />
        </el-form-item>
        <div class="config-number-row">
          <el-form-item label="Temperature">
            <el-input-number v-model="configForm.temperature" :min="0" :max="2" :step="0.1" />
          </el-form-item>
          <el-form-item label="Max Tokens">
            <el-input-number v-model="configForm.maxTokens" :min="200" :max="4000" :step="100" />
          </el-form-item>
        </div>
        <el-button class="config-save-button" :loading="configSaving" @click="$emit('save-config')">
          保存接口配置
        </el-button>
      </el-form>
    </div>

    <el-form label-position="top" class="ai-form">
      <el-form-item label="套餐" required>
        <el-select v-model="form.packageId" filterable placeholder="选择套餐">
          <el-option
            v-for="item in packages"
            :key="item.packageId"
            :label="`${item.packageName} / ${item.areaName}`"
            :value="item.packageId"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="渠道" required>
        <el-segmented v-model="form.channel" :options="channelOptions" />
      </el-form-item>
      <el-form-item label="语气风格">
        <el-input v-model="form.tone" placeholder="例如：真实群主口吻" />
      </el-form-item>
      <el-form-item label="补充要求 / 模板参考">
        <el-input
          v-model="form.extraInstruction"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="可以贴模板、禁用词或具体口吻要求，例如：多强调工作日晚餐，别写官方广告腔"
        />
      </el-form-item>
      <el-form-item label="生成数量" required>
        <el-input-number v-model="form.copyCount" :min="1" :max="5" />
      </el-form-item>
      <div class="generate-actions">
        <el-button
          class="generate-button"
          type="primary"
          :icon="MagicStick"
          :loading="loading && generationMode === 'ai'"
          @click="$emit('generate', true)"
        >
          AI生成文案
        </el-button>
        <el-button
          class="generate-button"
          :loading="loading && generationMode === 'rule'"
          @click="$emit('generate', false)"
        >
          规则兜底生成
        </el-button>
      </div>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { MagicStick, Refresh } from '@element-plus/icons-vue';
import type { RecommendPackageItem, Channel } from '@content/shared';
import type { AICopyStatus } from '../services/api';
import SectionHeader from './SectionHeader.vue';

export interface GenerateForm {
  packageId: string;
  channel: Channel;
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

defineProps<{
  aiStatus: AICopyStatus | null;
  configSaving: boolean;
  loading: boolean;
  generationMode: 'ai' | 'rule' | null;
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
}>();

const form = defineModel<GenerateForm>('form', { required: true });
const configForm = defineModel<AIConfigForm>('configForm', { required: true });

defineEmits<{
  'refresh-status': [];
  'save-config': [];
  generate: [useAI: boolean];
}>();
</script>

<style scoped>
.ai-control-panel {
  align-self: start;
}

.ai-status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}

.ai-status-card.offline {
  border-color: #fed7aa;
  background: var(--warning-soft);
}

.ai-status-card strong,
.ai-status-card span,
.ai-status-card small {
  display: block;
}

.ai-status-card span {
  margin-top: 3px;
  color: var(--accent);
  font-weight: 700;
}

.ai-status-card small {
  max-width: 240px;
  margin-top: 4px;
  color: var(--muted);
  word-break: break-all;
}

.ai-form {
  margin-top: 16px;
}

.config-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft, #f8fafc);
}

.config-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.config-head strong {
  color: var(--ink);
}

.config-head span {
  color: var(--muted);
  font-size: 12px;
}

.config-number-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.config-number-row :deep(.el-input-number) {
  width: 100%;
}

.config-save-button {
  width: 100%;
}

.generate-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.generate-button {
  width: 100%;
}

@media (max-width: 980px) {
  .config-number-row {
    grid-template-columns: 1fr;
  }
}
</style>

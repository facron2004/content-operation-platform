<script setup lang="ts">
import { computed } from 'vue';
import type { RecommendPackageItem } from '@content/shared';
import type { GenerateForm } from './AiConfigPanel.vue';
import { GENERATE_SCENARIO_PRESETS } from '../composables/generate-core';
const props = withDefaults(
  defineProps<{
    packages: RecommendPackageItem[];
    channelOptions: Array<{ label: string; value: string }>;
    // Residual #268: generate package picker first-200 / RECOMMEND_CACHE_CAP honesty.
    truncated?: boolean;
    limit?: number | null;
    matchedCount?: number | null;
  }>(),
  {
    truncated: false,
    limit: null,
    matchedCount: null
  }
);
const form = defineModel<GenerateForm>('form', { required: true });

const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 200
);
const matchedLabel = computed(() =>
  typeof props.matchedCount === 'number' && props.matchedCount >= 0 ? props.matchedCount : null
);

function applyScenarioPreset(preset: string) {
  form.value.scenario = preset;
}
</script>
<template>
  <el-form-item label="套餐" required>
    <!-- Residual #268: multi-page picker + RECOMMEND_CACHE_CAP honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      套餐下拉仅加载评分最高的前 {{ limitLabel }} 条
      <template v-if="matchedLabel != null">（匹配 {{ matchedLabel }} 条）</template>
      ；可从推荐列表跳转带 packageId，或在推荐页筛选后生成。
    </p>
    <el-select
      v-model="form.packageId"
      filterable
      default-first-option
      no-match-text="没有匹配的套餐"
      placeholder="搜索或选择套餐"
    >
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
  <!-- Residual #238: GenerateCopyDto.scenario drives prompt/rule scenarioWritingGoal. -->
  <el-form-item label="运营场景">
    <el-input
      v-model="form.scenario"
      maxlength="200"
      show-word-limit
      placeholder="留空则按「日常运营推荐」；也可自定义场景"
    />
    <div class="scenario-presets">
      <button
        v-for="preset in GENERATE_SCENARIO_PRESETS"
        :key="preset"
        type="button"
        class="scenario-chip"
        :class="{ active: form.scenario === preset }"
        @click="applyScenarioPreset(preset)"
      >
        {{ preset }}
      </button>
    </div>
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
</template>

<style scoped>
.scenario-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.scenario-chip {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank, #fff);
  color: var(--el-text-color-regular);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.scenario-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.scenario-chip.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary);
}

.list-cap-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border-radius: 4px;
  padding: 4px 8px;
}
</style>

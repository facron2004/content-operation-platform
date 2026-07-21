<script setup lang="ts">
import type { RecommendPackageItem } from '@content/shared';
import type { GenerateForm } from './AiConfigPanel.vue';
defineProps<{
  packages: RecommendPackageItem[];
  channelOptions: Array<{ label: string; value: string }>;
}>();
const form = defineModel<GenerateForm>('form', { required: true });
</script>
<template>
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
</template>

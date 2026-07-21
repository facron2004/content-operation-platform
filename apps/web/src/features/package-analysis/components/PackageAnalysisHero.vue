<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue';
import type { ContentPackage } from '@content/shared';
import type { PackageAnalysisHeroData } from '../package-analysis-ui';
import PackageAnalysisHeroTags from './PackageAnalysisHeroTags.vue';
defineProps<{ pkg: ContentPackage; analysis: PackageAnalysisHeroData }>();
defineEmits<{ back: [] }>();
</script>
<template>
  <section class="analysis-hero">
    <div class="analysis-copy">
      <el-button class="back-button" :icon="ArrowLeft" @click="$emit('back')">返回套餐页</el-button>
      <p class="eyebrow">{{ pkg.areaName }} / {{ pkg.category }}</p>
      <h2>{{ pkg.packageName }}</h2>
      <PackageAnalysisHeroTags :analysis="analysis" />
    </div>
    <div class="score-block">
      <span>库存剩余</span>
      <strong>{{ pkg.stockLeft }}</strong>
      <small>总库存 {{ pkg.stockTotal }}</small>
    </div>
  </section>
</template>

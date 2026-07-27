<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue';
import type { ContentPackage } from '@content/shared';
import type { PackageAnalysisHeroData } from '../package-analysis-ui';
import AppleButton from '../../../components/AppleButton.vue';
import PackageAnalysisHeroTags from './PackageAnalysisHeroTags.vue';
defineProps<{ pkg: ContentPackage; analysis: PackageAnalysisHeroData }>();
defineEmits<{ back: [] }>();
</script>
<template>
  <section class="analysis-hero">
    <div class="analysis-copy">
      <AppleButton class="back-button" variant="secondary" @click="$emit('back')">
        <template #icon>
          <el-icon><ArrowLeft /></el-icon>
        </template>
        返回套餐页
      </AppleButton>
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

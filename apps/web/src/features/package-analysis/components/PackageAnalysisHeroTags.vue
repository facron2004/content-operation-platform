<script setup lang="ts">
import {
  analysisStatusLabel,
  inventoryFlagTagType,
  operationFlagTagType,
  salesFlagTagType,
  type PackageAnalysisHeroData
} from '../package-analysis-ui';
defineProps<{ analysis: PackageAnalysisHeroData }>();
</script>
<template>
  <div class="analysis-tags">
    <el-tag>{{ analysisStatusLabel(analysis.status) }}</el-tag>
    <el-tag
      v-if="analysis.inventoryFlag && analysis.inventoryFlag !== 'normal'"
      :type="inventoryFlagTagType(analysis.inventoryFlagLevel)"
      effect="dark"
    >
      {{ analysis.inventoryFlagLabel }}
    </el-tag>
    <el-tag
      v-if="analysis.inventorySalesLabel"
      :type="salesFlagTagType(analysis.inventorySalesLevel)"
      effect="plain"
    >
      {{ analysis.inventorySalesLabel }}
    </el-tag>
    <el-tag type="info">未售罄 {{ analysis.inventoryBacklogDays ?? 0 }} 天</el-tag>
    <el-tag
      v-for="tag in analysis.operationTags ?? []"
      :key="tag.key"
      :type="operationFlagTagType(tag.level)"
      effect="light"
    >
      {{ tag.label }}
    </el-tag>
  </div>
</template>

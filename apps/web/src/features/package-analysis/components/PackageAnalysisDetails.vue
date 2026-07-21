<script setup lang="ts">
import type { ContentPackage } from '@content/shared';
defineProps<{ pkg: ContentPackage; packageId: string }>();
</script>
<template>
  <section class="panel package-long-panel">
    <div class="panel-head">
      <h2>卖点与限制</h2>
      <el-button type="primary" @click="$router.push({ path: '/generate', query: { packageId } })">
        生成文案
      </el-button>
    </div>
    <div class="detail-columns">
      <div class="detail-block">
        <h3>卖点</h3>
        <ul>
          <li v-for="point in pkg.sellingPoints ?? []" :key="point">{{ point }}</li>
          <li v-if="!pkg.sellingPoints?.length" class="muted-cell">暂无卖点</li>
        </ul>
      </div>
      <div class="detail-block">
        <h3>使用限制</h3>
        <ul>
          <li v-for="rule in pkg.useRules ?? []" :key="rule">{{ rule }}</li>
          <li v-if="!pkg.useRules?.length" class="muted-cell">暂无限制</li>
        </ul>
      </div>
      <div class="detail-block detail-summary">
        <h3>套餐详情</h3>
        <p>{{ pkg.detailSummary || '暂无套餐详情摘要' }}</p>
      </div>
    </div>
  </section>
</template>

<template>
  <header class="zs-hero panel">
    <div>
      <p class="eyebrow">运营中台 / 零动销</p>
      <h2>零动销清单</h2>
      <p class="hero-description">有库存长期无销的商家 / SKU，按 7d–60d 阶梯筛选。</p>
    </div>
    <div class="hero-meta">
      <el-tag size="small" effect="plain" type="info">当前阶梯：{{ bucketLabel }}</el-tag>
      <AppleButton size="sm" variant="secondary" :loading="loading" @click="$emit('reload')">
        刷新
      </AppleButton>
    </div>
  </header>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ bucketLabel: string; loading: boolean }>();
defineEmits<{ reload: [] }>();
</script>

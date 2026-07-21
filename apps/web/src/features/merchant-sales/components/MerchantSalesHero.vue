<template>
  <header class="ms-hero panel">
    <div>
      <p class="eyebrow">数据中台 / 商家 · 销售</p>
      <h2>商家销售数据</h2>
      <p class="hero-description">
        按日 / 周 / 月 / 年维度追踪每个商家的销售走势,识别高潜商家与风险商家。
      </p>
    </div>
    <div class="hero-meta">
      <el-button size="small" :loading="loading" @click="$emit('reload')">刷新</el-button>
      <el-button
        size="small"
        :icon="Download"
        :loading="exporting"
        :disabled="!canExport"
        @click="$emit('export')"
      >
        导出 CSV
      </el-button>
    </div>
  </header>
</template>
<script setup lang="ts">
import { Download } from '@element-plus/icons-vue';
defineProps<{ loading: boolean; exporting: boolean; canExport: boolean }>();
defineEmits<{ reload: []; export: [] }>();
</script>

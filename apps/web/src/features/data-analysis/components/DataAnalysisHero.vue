<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';

defineProps<{ loading: boolean; exporting: boolean; canExport: boolean }>();
defineEmits<{ reload: []; export: [] }>();
</script>

<template>
  <header class="da-hero">
    <div>
      <h2>数据分析</h2>
      <p class="hero-description">围绕订单生产、异常响应与数据回收的一体化运营工作台。</p>
    </div>
    <div class="hero-meta">
      <AppleButton
        variant="secondary"
        :loading="loading"
        :disabled="exporting"
        @click="$emit('reload')"
      >
        刷新
      </AppleButton>
      <AppleButton
        variant="primary"
        :loading="exporting"
        :disabled="!canExport || loading"
        @click="$emit('export')"
      >
        <template #icon>
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </template>
        导出 Excel
      </AppleButton>
    </div>
  </header>
</template>

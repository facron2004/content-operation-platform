<template>
  <section class="attribution-hero">
    <div>
      <p class="eyebrow">Attribution Control</p>
      <h2>订单归因校准</h2>
      <p class="hero-description">
        查看时间窗口内尚未归因的订单，并在确认任务与套餐一致后进行手工绑定。
      </p>
      <p class="hero-window">
        数据窗口：{{ dateFrom && dateTo ? `${dateFrom} 至 ${dateTo}` : '加载中' }}
      </p>
    </div>
    <div class="hero-actions">
      <div class="hero-chip">
        <span>未匹配订单</span>
        <strong>{{ total }}</strong>
      </div>
      <AppleButton
        variant="secondary"
        :loading="loading"
        :disabled="actionLoading"
        @click="$emit('reload')"
      >
        刷新列表
      </AppleButton>
      <AppleButton
        v-if="canManage"
        variant="primary"
        :loading="actionLoading"
        :disabled="loading"
        @click="$emit('recompute')"
      >
        重算归因
      </AppleButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';

defineProps<{
  loading: boolean;
  actionLoading: boolean;
  canManage: boolean;
  total: number;
  dateFrom: string;
  dateTo: string;
}>();

defineEmits<{
  reload: [];
  recompute: [];
}>();
</script>

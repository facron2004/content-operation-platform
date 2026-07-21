<template>
  <el-scrollbar :height="listHeight" class="merchant-scroll">
    <ul class="merchant-list">
      <MerchantListRow
        v-for="m in merchants"
        :key="m.merchantId"
        :merchant="m"
        :selected-merchant-id="selectedMerchantId"
        @select="$emit('select', $event)"
      />
    </ul>
  </el-scrollbar>
</template>
<script setup lang="ts">
import MerchantListRow from './MerchantListRow.vue';
import type { MerchantListItem } from '../types/merchant-list-item';
defineProps<{
  merchants: MerchantListItem[];
  selectedMerchantId?: string | null;
  listHeight: number | string;
}>();
defineEmits<{ (e: 'select', merchantId: string): void }>();
</script>

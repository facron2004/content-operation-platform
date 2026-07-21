<template>
  <section class="panel top-offenders">
    <header>
      <h3>Top 商家 GMV</h3>
      <el-radio-group :model-value="merchantSort" size="small" @change="onSortChange">
        <el-radio-button value="gmvDesc">按 GMV</el-radio-button>
        <el-radio-button value="refundDesc">按 退款</el-radio-button>
        <el-radio-button value="verifyDesc">按 核销</el-radio-button>
      </el-radio-group>
    </header>
    <GmvTopMerchantsTableBody :top-merchants="topMerchants" />
  </section>
</template>
<script setup lang="ts">
import GmvTopMerchantsTableBody from './GmvTopMerchantsTableBody.vue';
defineProps<{
  topMerchants: Array<{
    merchantName: string;
    areaName?: string | null;
    gmv: number;
    gmvRefund: number;
    gmvVerify: number;
    refundRate: number;
    verifyRate: number;
    paidOrderCount: number;
  }>;
  merchantSort: string;
}>();
const emit = defineEmits<{
  (e: 'update:merchantSort', value: string): void;
  (e: 'change'): void;
}>();
function onSortChange(value: string | number | boolean | undefined) {
  emit('update:merchantSort', String(value));
  emit('change');
}
</script>

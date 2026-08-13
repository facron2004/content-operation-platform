<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import ZeroSalesPageBody from '../features/zero-sales/components/ZeroSalesPageBody.vue';
import { useZeroSalesPage } from '../features/zero-sales/composables/useZeroSalesPage';
const page = useZeroSalesPage();
const { loading, loadError, summaryError, reloadAll } = page;
</script>
<template>
  <section v-loading="loading" class="page-stack zero-sales">
    <div class="page-toolbar">
      <AppleButton size="sm" variant="secondary" :loading="loading" @click="reloadAll">
        重新加载本地数据
      </AppleButton>
    </div>
    <ErrorAlert :message="loadError || summaryError" />
    <ZeroSalesPageBody :page="page" />
  </section>
</template>
<style src="../styles/views/zero-sales.css" scoped></style>

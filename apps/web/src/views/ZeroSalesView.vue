<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import ZeroSalesHeader from '../features/zero-sales/components/ZeroSalesHeader.vue';
import ZeroSalesPageBody from '../features/zero-sales/components/ZeroSalesPageBody.vue';
import { useZeroSalesPage } from '../features/zero-sales/composables/useZeroSalesPage';
const page = useZeroSalesPage();
const { loading, loadError, summaryError, bucketLabel, reloadAll } = page;
</script>
<template>
  <section v-loading="loading" class="page-stack zero-sales">
    <ZeroSalesHeader :bucket-label="bucketLabel" :loading="loading" @reload="reloadAll" />
    <ErrorAlert :message="loadError || summaryError" />
    <ZeroSalesPageBody :page="page" />
  </section>
</template>
<style src="../styles/views/zero-sales.css" scoped></style>

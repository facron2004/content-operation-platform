<template>
  <div class="pager">
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      @update:current-page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
      @current-change="load"
      @size-change="load"
    />
  </div>
</template>
<script setup lang="ts">
defineProps<{ page: number; pageSize: number; total: number; load: () => void }>();
const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>();
</script>

<template>
  <div class="table-skeleton">
    <div v-for="i in rows" :key="i" class="skeleton-row">
      <div v-for="j in columns" :key="j" class="skeleton-cell">
        <div class="skeleton-line" :style="{ width: getWidth(j) }"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  rows?: number;
  columns?: number;
}

const { rows, columns } = withDefaults(defineProps<Props>(), {
  rows: 5,
  columns: 6
});

const getWidth = (index: number) => {
  const widths = ['60%', '80%', '70%', '90%', '75%', '85%'];
  return widths[index % widths.length];
};
</script>

<style scoped>
.table-skeleton {
  padding: 16px;
}

.skeleton-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.skeleton-cell {
  flex: 1;
}

.skeleton-line {
  height: 16px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>

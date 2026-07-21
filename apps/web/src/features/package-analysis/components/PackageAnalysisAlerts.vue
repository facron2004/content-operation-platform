<template>
  <section v-if="pkg" class="panel">
    <div class="panel-head">
      <h2>异常预警与下一步动作</h2>
      <el-button
        type="primary"
        @click="$router.push({ path: '/generate', query: { packageId, mode: 'battle-card' } })"
      >
        生成作战卡
      </el-button>
    </div>
    <el-table :data="alerts" height="220" empty-text="暂无预警">
      <el-table-column prop="title" label="预警" width="140" />
      <el-table-column prop="reason" label="原因" min-width="240" show-overflow-tooltip />
      <el-table-column prop="action" label="动作" min-width="280" show-overflow-tooltip />
    </el-table>
  </section>
</template>
<script setup lang="ts">
defineProps<{
  packageId: string;
  pkg: unknown;
  alerts: Array<{ title?: string; reason?: string; action?: string }>;
}>();
</script>

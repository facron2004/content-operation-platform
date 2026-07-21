<template>
  <section class="panel">
    <div class="panel-head"><h2>推送记录与转化数据</h2></div>
    <el-table :data="rows" height="320" empty-text="暂无社群任务">
      <el-table-column prop="groupName" label="社群" min-width="150" />
      <el-table-column prop="packageName" label="推荐套餐" min-width="200" show-overflow-tooltip />
      <el-table-column prop="plannedTime" label="推送时间" width="90" />
      <el-table-column prop="reason" label="推荐原因" min-width="200" show-overflow-tooltip />
      <el-table-column prop="nextAction" label="下一步动作" min-width="180" show-overflow-tooltip />
    </el-table>
  </section>
</template>
<script setup lang="ts">
defineProps<{
  rows: Array<{
    groupName: string;
    packageName: string;
    plannedTime: string;
    reason: string;
    nextAction: string;
  }>;
}>();
</script>

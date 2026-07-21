<template>
  <section class="panel">
    <div class="panel-head"><h2>可生成文案角度</h2></div>
    <div class="tag-cloud">
      <el-tag v-for="angle in copyAngles" :key="angle" size="large">{{ angle }}</el-tag>
      <el-tag v-for="tip in riskTips" :key="tip" type="warning" size="large">{{ tip }}</el-tag>
    </div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ copyAngles: string[]; riskTips: string[] }>();
</script>

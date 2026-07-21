<script setup lang="ts">
const model = defineModel<string>({ required: true });
</script>
<template>
  <section class="focus-strip panel">
    <div class="focus-strip-head">
      <div>
        <h3>任务焦点</h3>
        <p>选择视角后只看当前最值得处理的一类内容。</p>
      </div>
    </div>
    <el-radio-group v-model="model" size="small" class="focus-toggle">
      <el-radio-button value="all">全局</el-radio-button>
      <el-radio-button value="push">必推</el-radio-button>
      <el-radio-button value="risk">风险</el-radio-button>
      <el-radio-button value="hot">爆品</el-radio-button>
      <el-radio-button value="slow">滞销</el-radio-button>
      <el-radio-button value="community">社群</el-radio-button>
      <el-radio-button value="review">复盘</el-radio-button>
    </el-radio-group>
  </section>
</template>

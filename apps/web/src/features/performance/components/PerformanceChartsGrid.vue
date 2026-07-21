<template>
  <div class="dashboard-grid charts-grid">
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>版本效果对比</h2>
          <p>观察不同文案版本的点击与下单差异。</p>
        </div>
      </div>
      <ChartPanel :option="versionOption" />
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>渠道转化</h2>
          <p>看点击主要来自哪些渠道，帮助分配投放重心。</p>
        </div>
      </div>
      <ChartPanel :option="channelOption" />
    </section>
  </div>
</template>
<script setup lang="ts">
import ChartPanel from '../../../components/ChartPanel.vue';
defineProps<{ versionOption: Record<string, unknown>; channelOption: Record<string, unknown> }>();
</script>

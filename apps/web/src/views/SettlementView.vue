<template>
  <section class="page-stack settlement-placeholder">
    <el-empty description="分账结算模块建设中">
      <template #description>
        <p class="placeholder-title">分账结算</p>
        <p class="placeholder-desc">该能力将对接平台分账与结算流水，敬请期待。</p>
      </template>
    </el-empty>
  </section>
</template>

<script setup lang="ts"></script>

<style scoped>
.settlement-placeholder {
  min-height: 420px;
  display: grid;
  place-items: center;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.placeholder-title {
  margin: 0 0 6px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}
.placeholder-desc {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
</style>

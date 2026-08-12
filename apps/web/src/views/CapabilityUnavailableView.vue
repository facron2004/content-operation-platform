<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const page = computed(() => {
  const path = route.path;
  if (path.startsWith('/packages/combinations')) {
    return {
      title: '组合套餐',
      description: '当前数据库只提供 ContentPackage 商品档案，尚未接入组合套餐的子商品关系和库存拆分。'
    };
  }
  if (path.startsWith('/deliveries')) {
    return {
      title: '发货物流',
      description: '当前数据模型尚未接入物流单、承运商和轨迹事件。'
    };
  }
  if (path.startsWith('/cards')) {
    return {
      title: path.startsWith('/cards/batches') ? '卡券批次' : '卡密管理',
      description: '当前数据模型尚未接入卡券批次、卡密和兑换状态。'
    };
  }
  if (path.startsWith('/stores')) {
    return {
      title: '门店管理',
      description: '当前数据库只有商家与店铺快照字段，尚未接入独立门店主数据。'
    };
  }
  if (path.startsWith('/merchants/scores')) {
    return {
      title: '商家评分',
      description: '当前评分字段仍属于商品档案维度，尚未形成可追溯的商家评分记录和评价来源。'
    };
  }
  return {
    title: '招商 CRM',
    description: '当前数据库尚未接入独立招商线索、跟进记录和转化阶段。'
  };
});
</script>

<template>
  <section class="page-stack capability-unavailable">
    <div class="panel capability-unavailable__hero">
      <p class="eyebrow">V2.0 / DATA CAPABILITY STATUS</p>
      <h1>{{ page.title }}</h1>
      <p class="hero-description">{{ page.description }}</p>
    </div>
    <div class="panel capability-unavailable__body">
      <div class="capability-unavailable__badge">数据能力未接入</div>
      <h2>此页面暂不展示其他业务数据</h2>
      <p>
        为避免把订单、商品或商家数据冒充为当前业务数据，页面保持明确的能力状态。接入对应数据模型和查询接口后，再开放列表、筛选与操作。
      </p>
    </div>
  </section>
</template>

<style scoped>
.capability-unavailable {
  max-width: 980px;
  margin: 0 auto;
}

.capability-unavailable__hero,
.capability-unavailable__body {
  padding: 28px;
}

.capability-unavailable__hero h1 {
  margin: 8px 0 10px;
}

.capability-unavailable__badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  color: #8a4b08;
  background: #fff3dc;
  font-size: 12px;
  font-weight: 700;
}

.capability-unavailable__body h2 {
  margin: 18px 0 8px;
}

.capability-unavailable__body p {
  max-width: 720px;
  color: #667085;
  line-height: 1.7;
}
</style>

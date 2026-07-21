<template>
  <div class="ops-card-list">
    <article
      v-for="item in items"
      :key="item.packageId"
      class="ops-card"
      @click="$emit('open', item.packageId)"
    >
      <div class="ops-card-main">
        <div class="ops-card-title">
          <strong>{{ item.packageName }}</strong>
          <el-tag :type="levelTagType[item.level] ?? 'warning'" effect="plain">
            {{ item.score }}分
          </el-tag>
        </div>
        <div class="ops-card-meta">
          <span>{{ item.currentPrice }}</span>
          <span>{{ item.areaName }}</span>
          <span>库存 {{ item.stockLeft }}</span>
        </div>
        <p>{{ item.reason }}</p>
        <div class="tag-cloud compact">
          <el-tag
            v-for="tag in (item.tags ?? []).slice(0, 4)"
            :key="tag.key"
            :type="riskTagType(tag.level)"
            effect="light"
          >
            {{ tag.label }}
          </el-tag>
        </div>
        <small>下一步：{{ item.nextAction }}</small>
      </div>
      <el-button size="small" type="primary" @click.stop="$emit('generate', item.packageId)">
        作战卡
      </el-button>
    </article>
  </div>
</template>
<script setup lang="ts">
import type { OperationCard } from '@content/shared';
import { levelTagType, riskTagType } from '../utils/labels';
defineProps<{ items: OperationCard[] }>();
defineEmits<{ open: [packageId: string]; generate: [packageId: string] }>();
</script>

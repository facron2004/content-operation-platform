<template>
  <article v-for="group in communities" :key="group.groupId" class="community-card">
    <div class="community-head">
      <div>
        <strong>{{ group.groupName }}</strong>
        <span>
          {{ group.areaName }} / {{ groupTypeLabels[group.groupType] ?? group.groupType }}
        </span>
      </div>
      <el-tag type="success" effect="plain">活跃 {{ group.activityScore }}</el-tag>
    </div>
    <div class="community-metrics">
      <div>
        <span>人数</span>
        <strong>{{ group.memberCount }}</strong>
      </div>
      <div>
        <span>历史转化</span>
        <strong>{{ formatPercent(group.historicalConversionRate) }}</strong>
      </div>
      <div>
        <span>适合品类</span>
        <strong>{{ group.preferredCategories.join('、') }}</strong>
      </div>
    </div>
    <CommunityPackageList :packages="group.todayRecommendedPackages" />
  </article>
</template>
<script setup lang="ts">
import type { CommunityGroup } from '@content/shared';
import { groupTypeLabels, percent as formatPercent } from '../../../utils/labels';
import CommunityPackageList from './CommunityPackageList.vue';
defineProps<{ communities: CommunityGroup[] }>();
</script>

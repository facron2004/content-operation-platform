<template>
  <div class="community-packages">
    <h3>今日推荐套餐</h3>
    <div v-for="pkg in packages" :key="pkg.packageId" class="community-package">
      <div>
        <strong>{{ pkg.packageName }}</strong>
        <span>{{ pkg.reason }}</span>
      </div>
      <AppleButton
        variant="secondary"
        size="sm"
        @click="
          $router.push({
            path: '/generate',
            query: { packageId: pkg.packageId, mode: 'battle-card' }
          })
        "
      >
        作战卡
      </AppleButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { CommunityGroup } from '@content/shared';
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{ packages: CommunityGroup['todayRecommendedPackages'] }>();
</script>

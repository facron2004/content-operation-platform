<template>
  <div class="battle-copy">
    <h3>社群文案</h3>
    <p>{{ battleCard.communityCopy }}</p>
  </div>
  <div class="battle-copy">
    <h3>朋友圈文案</h3>
    <p>{{ battleCard.momentsCopy }}</p>
  </div>
  <div class="battle-copy">
    <h3>商家转发文案</h3>
    <p>{{ battleCard.merchantShareCopy }}</p>
  </div>
  <div class="battle-copy">
    <h3>二次跟进</h3>
    <p>{{ battleCard.followUpCopy }}</p>
  </div>
  <div class="battle-copy">
    <h3>售罄承接</h3>
    <p>{{ battleCard.soldOutFallbackCopy }}</p>
  </div>
</template>
<script setup lang="ts">
import type { BattleCard } from '@content/shared';
defineProps<{ battleCard: BattleCard }>();
</script>

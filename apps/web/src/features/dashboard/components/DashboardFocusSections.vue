<template>
  <DashboardFocusPushRisk
    :active-focus="activeFocus"
    :console-data="consoleData"
    @open="$emit('open', $event)"
    @generate="$emit('generate', $event)"
  />
  <DashboardFocusHotSlow
    :active-focus="activeFocus"
    :console-data="consoleData"
    @open="$emit('open', $event)"
    @generate="$emit('generate', $event)"
  />
  <div v-if="['all', 'community', 'review'].includes(activeFocus)" class="ops-grid">
    <CommunityTaskPanel
      v-if="activeFocus === 'all' || activeFocus === 'community'"
      :tasks="consoleData.communityTasks ?? []"
      @navigate="$emit('navigate', $event)"
      @generate-card="$emit('generate', $event)"
    />
    <ReviewPanel
      v-if="activeFocus === 'all' || activeFocus === 'review'"
      :review="consoleData.yesterdayReview"
      :title-join-truncated="consoleData.titleJoinTruncated"
      :title-join-limit="consoleData.titleJoinLimit"
      :title-join-loaded="consoleData.titleJoinLoaded"
      :title-join-missed="consoleData.titleJoinMissed"
      @navigate="$emit('navigate', $event)"
    />
  </div>
  <AlertPreview
    v-if="activeFocus === 'all'"
    :alerts="consoleData.alerts ?? []"
    @navigate="$emit('navigate', $event)"
  />
</template>
<script setup lang="ts">
import type { OperationConsoleData } from '../composables/useDashboard';
import CommunityTaskPanel from './CommunityTaskPanel.vue';
import ReviewPanel from './ReviewPanel.vue';
import AlertPreview from './AlertPreview.vue';
import DashboardFocusPushRisk from './DashboardFocusPushRisk.vue';
import DashboardFocusHotSlow from './DashboardFocusHotSlow.vue';
defineProps<{ activeFocus: string; consoleData: OperationConsoleData }>();
defineEmits<{
  open: [packageId: string];
  generate: [packageId: string];
  navigate: [path: string];
}>();
</script>

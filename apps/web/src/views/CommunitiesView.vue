<template>
  <section v-loading="loading" class="page-stack">
    <ErrorAlert :message="loadError" style="margin-bottom: 12px" />
    <CommunitiesToolbar :loading="loading" @refresh="load(true)" />
    <div class="community-grid"><CommunityCards :communities="communities" /></div>
    <CommunityPushTable :rows="pushRows" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { CommunityGroup } from '@content/shared';
import { api } from '../services/api';
import { useRoleStore } from '../stores/role';
import { useApiFetch } from '../composables/useApiFetch';
import ErrorAlert from '../components/ErrorAlert.vue';
import { buildCommunityPushRows } from '../features/communities/community-push-rows';
import CommunityCards from '../features/communities/components/CommunityCards.vue';
import CommunityPushTable from '../features/communities/components/CommunityPushTable.vue';
import CommunitiesToolbar from '../features/communities/components/CommunitiesToolbar.vue';
const roleStore = useRoleStore(),
  {
    loading,
    data,
    error: loadError,
    load
  } = useApiFetch<{ items: CommunityGroup[] }>(
    () => api.getCommunities({ role: roleStore.currentRole }),
    { errorMessage: '社群数据加载失败，请稍后重试' }
  ),
  communities = computed(() => data.value?.items ?? []),
  pushRows = computed(() => buildCommunityPushRows(communities.value));
onMounted(() => load());
watch(
  () => roleStore.currentRole,
  () => load(true)
);
</script>
<style src="../styles/views/communities.css" scoped></style>

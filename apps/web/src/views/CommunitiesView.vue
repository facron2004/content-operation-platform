<template>
  <section v-loading="loading" class="page-stack">
    <ErrorAlert :message="loadError" style="margin-bottom: 12px" />
    <CommunitiesToolbar :loading="loading" @refresh="load(true)" />
    <!-- Residual #278: RECOMMEND_CACHE_CAP source undercount honesty. -->
    <p v-if="sourceTruncated" class="list-cap-hint">
      推荐源仅加载评分前 {{ sourceLimit }} 个在售套餐（匹配
      {{ sourceMatchedCount }}），派生社群可能不完整。
    </p>
    <!-- Residual #278: MAX_DERIVED_COMMUNITY_INPUT_PACKAGES second-clip honesty. -->
    <p v-if="inputTruncated" class="list-cap-hint">
      社群派生仅使用评分前 {{ inputLimit }} 个套餐作为输入（已加载
      {{ inputLoaded }}），分组结果可能不完整。
    </p>
    <!-- Residual #281: MAX_DERIVED_COMMUNITY_GROUPS output-cap honesty. -->
    <p v-if="groupTruncated" class="list-cap-hint">
      派生社群仅展示活跃度前 {{ groupLimit }} 个分组（共匹配
      {{ groupMatched }} 个），其余分组未展示。
    </p>
    <div class="community-grid"><CommunityCards :communities="communities" /></div>
    <CommunityPushTable :rows="pushRows" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { CommunitiesResponse } from '@content/shared';
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
  } = useApiFetch<CommunitiesResponse>(
    (force) =>
      api.getCommunities({
        role: roleStore.currentRole,
        ...(force ? { force: true } : {})
      }),
    {
      errorMessage: '社群数据加载失败，请稍后重试',
      cacheKeyPattern: '/content/communities'
    }
  ),
  communities = computed(() => data.value?.items ?? []),
  pushRows = computed(() => buildCommunityPushRows(communities.value)),
  // Residual #278
  sourceTruncated = computed(() => data.value?.sourceTruncated === true),
  sourceLimit = computed(() => data.value?.sourceLimit ?? 0),
  sourceMatchedCount = computed(() => data.value?.sourceMatchedCount ?? 0),
  inputTruncated = computed(() => data.value?.inputTruncated === true),
  inputLimit = computed(() => data.value?.inputLimit ?? 0),
  inputLoaded = computed(() => data.value?.inputLoaded ?? 0),
  // Residual #281
  groupTruncated = computed(() => data.value?.groupTruncated === true),
  groupLimit = computed(() => data.value?.groupLimit ?? 0),
  groupMatched = computed(() => data.value?.groupMatched ?? 0);
onMounted(() => load());
watch(
  () => roleStore.currentRole,
  () => load()
);
</script>
<style src="../styles/views/communities.css" scoped></style>

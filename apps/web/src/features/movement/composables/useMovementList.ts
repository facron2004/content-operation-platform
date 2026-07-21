import { useRouter } from 'vue-router';
import {
  STALE_BUCKETS,
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS
} from '../../../services/api/movement.api';
import { beijingDateKey } from '@content/shared';
import {
  bindMovementListLoaders,
  createMovementListState,
  createMovementPagination
} from './movement-list-core';
import { buildMovementListActions } from './movement-list-ui';

export { STALE_BUCKETS, STALE_BUCKET_COLORS, STALE_BUCKET_LABELS };
export type { StaleBucket } from '../../../services/api/movement.api';
export { buildMovementBucketOption } from './movement-list-ui';

export function useMovementList() {
  const router = useRouter();
  const state = createMovementListState();
  const { loadList, reload, emptyText } = bindMovementListLoaders(state);
  const pagination = createMovementPagination({
    page: state.page,
    hasMore: state.hasMore,
    loadList
  });
  const actions = buildMovementListActions({
    router,
    filters: state.filters,
    activeTab: state.activeTab,
    page: state.page,
    loadList,
    pagination
  });
  return { ...state, todayText: beijingDateKey(), emptyText, reload, ...actions };
}

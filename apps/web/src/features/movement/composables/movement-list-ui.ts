import type { Router } from 'vue-router';
import {
  getStagnantExportUrl,
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  type MovementSkuRow,
  type StaleBucket
} from '../../../services/api/movement.api';
import { downloadBlob } from '../../../services/http-client';
import { buildCategoryBar } from '../../../utils/chart-options';
import { STALE_BUCKET_CHART_COLORS, STALE_BUCKET_CHART_LABELS } from '../../../utils/chart-theme';
import { formatNumber, formatPercent } from '../../../utils/format';
import { type createMovementPagination } from './movement-list-core';

export function buildMovementBucketOption(
  distribution: Array<{ bucket: StaleBucket; totalSku: number }>
) {
  return buildCategoryBar({
    items: distribution.map((b) => ({
      label: STALE_BUCKET_CHART_LABELS[b.bucket] ?? b.bucket,
      value: b.totalSku,
      color: STALE_BUCKET_CHART_COLORS[b.bucket] ?? '#94a3b8',
      key: b.bucket
    })),
    yName: 'SKU 数',
    showShare: true,
    rotate: 15,
    barMaxWidth: 36
  });
}

function exportMovementStagnantCsv(params: {
  bucket?: StaleBucket;
  search?: string;
  sort?: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  // Residual #214: export respects same merchant/category/area filters as list.
  merchantId?: string;
  category?: string;
  areaId?: string;
}): void {
  downloadBlob(
    getStagnantExportUrl({
      bucket: params.bucket,
      search: params.search,
      sort: params.sort,
      merchantId: params.merchantId,
      category: params.category,
      areaId: params.areaId
    }),
    `滞销库存-${params.bucket ?? '全部'}.csv`
  );
}

function goMovementPackageAnalysis(router: Router, packageId: string): void {
  router.push({ name: 'package-analysis', params: { packageId }, query: { from: 'movement' } });
}

function movementRowClass({ row }: { row: MovementSkuRow }): string {
  if (row.staleBucket === 'stale_60d') return 'is-danger';
  if (row.staleBucket === 'stale_30d') return 'is-warning';
  return '';
}

function movementBucketLabel(bucket: StaleBucket): string {
  return STALE_BUCKET_LABELS[bucket] ?? bucket;
}

function movementBucketColor(bucket: StaleBucket): string {
  return STALE_BUCKET_COLORS[bucket] ?? '#94a3b8';
}

type MovementListActionOptions = {
  router: Router;
  filters: {
    value: {
      bucket: StaleBucket;
      days: 1 | 7 | 30;
      search?: string;
      sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
      merchantId?: string;
      category?: string;
      areaId?: string;
    };
  };
  activeTab: { value: 'stagnant' | 'moving' };
  page: { value: number };
  loadList: () => Promise<void>;
  pagination: ReturnType<typeof createMovementPagination>;
};

export function buildMovementListActions(options: MovementListActionOptions) {
  return {
    reloadList: async () => {
      options.page.value = 1;
      await options.loadList();
    },
    onTabChange: options.pagination.onTabChange,
    onBucketClick: (bucket: StaleBucket) =>
      options.pagination.onBucketClick(
        bucket,
        (b) => {
          options.filters.value.bucket = b;
        },
        () => {
          options.activeTab.value = 'stagnant';
        }
      ),
    prevPage: options.pagination.prevPage,
    nextPage: options.pagination.nextPage,
    exportCsv: () =>
      exportMovementStagnantCsv({
        bucket: options.filters.value.bucket,
        search: options.filters.value.search,
        sort: options.filters.value.sort,
        merchantId: options.filters.value.merchantId,
        category: options.filters.value.category,
        areaId: options.filters.value.areaId
      }),
    goAnalysis: (packageId: string) => goMovementPackageAnalysis(options.router, packageId),
    rowClass: movementRowClass,
    formatPercent,
    formatNumber,
    bucketLabel: movementBucketLabel,
    bucketColor: movementBucketColor
  };
}

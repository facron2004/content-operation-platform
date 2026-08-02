import type { Router } from 'vue-router';
import {
  getStagnantExportUrl,
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  type MovementSkuRow,
  type StaleBucket
} from '../../../services/api/movement.api';
import { downloadBlob } from '../../../services/http-client';
import { STALE_BUCKET_CHART_COLORS, STALE_BUCKET_CHART_LABELS } from '../../../utils/chart-theme';
import { formatNumber, formatPercent } from '../../../utils/format';
import { type createMovementPagination } from './movement-list-core';

const MOVEMENT_BUCKET_ORDER: StaleBucket[] = [
  'stale_60d',
  'stale_30d',
  'stale_15d',
  'stale_7d',
  'normal'
];

function orderedMovementBuckets(distribution: Array<{ bucket: StaleBucket; totalSku: number }>) {
  const byBucket = new Map(distribution.map((item) => [item.bucket, item.totalSku]));
  return MOVEMENT_BUCKET_ORDER.map((bucket) => ({
    bucket,
    totalSku: byBucket.get(bucket) ?? 0
  }));
}

export function buildMovementBucketOption(
  distribution: Array<{ bucket: StaleBucket; totalSku: number }>
) {
  const items = orderedMovementBuckets(distribution);
  const total = items.reduce((sum, item) => sum + item.totalSku, 0);

  return {
    animationDuration: 420,
    grid: { left: 82, right: 118, top: 2, bottom: 4, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (params: { data?: { value?: number; shareLabel?: string }; name?: string }) =>
        `${params.name ?? ''}<br/>${params.data?.value ?? 0} SKU · ${params.data?.shareLabel ?? '0.00%'}`
    },
    xAxis: {
      type: 'value',
      max: Math.max(total, 1),
      show: false
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map((item) => STALE_BUCKET_CHART_LABELS[item.bucket] ?? item.bucket),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: (value: string) => {
          const bucket = items.find(
            (item) => (STALE_BUCKET_CHART_LABELS[item.bucket] ?? item.bucket) === value
          )?.bucket;
          return bucket ? (STALE_BUCKET_CHART_COLORS[bucket] ?? '#8e8e93') : '#8e8e93';
        },
        fontSize: 12,
        fontWeight: 700
      }
    },
    series: [
      {
        type: 'bar',
        barWidth: 10,
        showBackground: true,
        backgroundStyle: {
          color: 'rgba(120, 120, 128, 0.10)',
          borderRadius: 999
        },
        label: {
          show: true,
          position: 'right',
          distance: 12,
          color: '#6e6e73',
          fontSize: 11,
          formatter: (params: { data?: { value?: number; shareLabel?: string } }) =>
            `${params.data?.value ?? 0}    ${params.data?.shareLabel ?? '0.00%'}`
        },
        data: items.map((item) => ({
          value: item.totalSku,
          key: item.bucket,
          shareLabel: formatPercent(total > 0 ? item.totalSku / total : 0),
          itemStyle: {
            color: STALE_BUCKET_CHART_COLORS[item.bucket] ?? '#8e8e93',
            borderRadius: 999
          }
        }))
      }
    ]
  };
}

export function buildMovementHealthOption(
  distribution: Array<{ bucket: StaleBucket; totalSku: number }>
) {
  const items = orderedMovementBuckets(distribution);

  return {
    animationDuration: 460,
    tooltip: {
      trigger: 'item',
      formatter: '{b}<br/>{c} SKU · {d}%'
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '50%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { scaleSize: 4 },
        data: items
          .filter((item) => item.totalSku > 0)
          .map((item) => ({
            value: item.totalSku,
            name: STALE_BUCKET_CHART_LABELS[item.bucket] ?? item.bucket,
            key: item.bucket,
            itemStyle: {
              color: STALE_BUCKET_CHART_COLORS[item.bucket] ?? '#8e8e93'
            }
          }))
      }
    ]
  };
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

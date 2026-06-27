<template>
  <section class="page-stack">
    <div class="filter-bar">
      <el-select v-model="filters.areaId" clearable placeholder="区域">
        <el-option
          v-for="area in areaOptions"
          :key="area.value"
          :label="area.label"
          :value="area.value"
        />
      </el-select>
      <el-select v-model="filters.category" clearable filterable placeholder="所属类型">
        <el-option
          v-for="category in categoryOptions"
          :key="category"
          :label="category"
          :value="category"
        />
      </el-select>
      <el-checkbox v-model="filters.unsoldOnly">只看未售罄链接</el-checkbox>
      <el-button type="primary" :loading="loading" @click="load(true)">
        {{ loading ? '加载中' : '刷新套餐' }}
      </el-button>
    </div>

    <section class="panel">
      <TableSkeleton v-if="loading && items.length === 0" :rows="10" :columns="9" />
      <el-table
        v-else
        :data="items"
        height="520"
        :default-sort="{ prop: 'stockLeft', order: 'descending' }"
        @row-dblclick="openAnalysis"
      >
        <el-table-column type="index" label="#" width="42" />
        <el-table-column
          prop="packageName"
          label="套餐名称"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column prop="category" label="类型" width="78" show-overflow-tooltip />
        <el-table-column prop="merchantName" label="商家" min-width="120" show-overflow-tooltip />
        <el-table-column prop="areaName" label="区域" width="68" />
        <el-table-column label="售价" width="68">
          <template #default="{ row }">{{ displayPrice(row) }}</template>
        </el-table-column>
        <el-table-column prop="stockLeft" label="库存" width="60" sortable />
        <el-table-column label="库存标记" width="96">
          <template #default="{ row }">
            <el-tag
              v-if="row.inventoryFlag !== 'normal'"
              :type="inventoryTagType(row.inventoryFlagLevel)"
              effect="dark"
              size="small"
            >
              {{ row.inventoryFlagLabel }}
            </el-tag>
            <span v-else class="muted-cell">正常</span>
          </template>
        </el-table-column>
        <el-table-column label="销售" width="80">
          <template #default="{ row }">
            <el-tag :type="salesTagType(row.inventorySalesLevel)" effect="plain" size="small">
              {{ row.inventorySalesLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="作战标签" min-width="150">
          <template #default="{ row }">
            <div class="tag-cloud table-tags">
              <el-tag
                v-for="tag in row.operationTags?.slice(0, 3) ?? []"
                :key="tag.key"
                :type="operationTagType(tag.level)"
                size="small"
                effect="light"
              >
                {{ tag.label }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分" width="56" sortable>
          <template #default="{ row }">
            <el-tooltip
              placement="top"
              :content="scoreTooltip(row.scoreBreakdown)"
              :disabled="!row.scoreBreakdown"
            >
              <el-tag
                :type="levelTagType[row.scoreBreakdown?.level ?? row.promotionLevel] ?? 'info'"
                effect="dark"
                size="small"
              >
                {{ row.scoreBreakdown?.totalScore ?? row.promotionScore }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="inventoryBacklogDays" label="天数" width="56" sortable />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="goGenerate(row.packageId)">
              文案
            </el-button>
            <el-button size="small" @click="openAnalysis(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            icon="🔍"
            title="暂无推荐套餐"
            description="当前筛选条件下没有找到符合的套餐，试试调整筛选条件"
            action-text="清空筛选"
            @action="clearFilters"
          />
        </template>
      </el-table>
      <!-- 服务端分页 -->
      <div class="table-footer">
        <span class="muted-cell">共 {{ pagination.total }} 条</span>
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[30, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :total="pagination.total"
          @current-change="loadPage"
          @size-change="loadPage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { displayPrice, inventoryTagType, levelTagType, operationTagType, salesTagType, scoreTooltip } from '../utils/labels';
import TableSkeleton from '../components/TableSkeleton.vue';
import EmptyState from '../components/EmptyState.vue';
import { useRecommendationsPage } from '../composables/useRecommendationsPage';

const {
  loading,
  items,
  categoryOptions,
  areaOptions,
  filters,
  pagination,
  load,
  loadPage,
  clearFilters,
  openAnalysis,
  goGenerate
} = useRecommendationsPage();
</script>

<style scoped>
.merchant-name-cell {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
  max-height: 3em; /* 2 lines * 1.5 line-height */
  word-break: break-all;
}

.muted-cell {
  color: var(--muted);
}

.table-tags {
  gap: 5px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
}
</style>

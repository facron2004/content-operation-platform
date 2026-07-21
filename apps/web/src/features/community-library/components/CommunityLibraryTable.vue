<template>
  <div class="community-library-table">
    <el-table v-loading="loading" :data="communities" border stripe class="community-table">
      <el-table-column label="社群名称" min-width="180" fixed="left">
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="emit('view', row)">
            {{ row.groupName }}
          </el-link>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          {{ groupTypeLabels[row.groupType] ?? row.groupType }}
        </template>
      </el-table-column>

      <el-table-column label="区域" width="120">
        <template #default="{ row }">{{ row.areaName || '-' }}</template>
      </el-table-column>

      <el-table-column label="负责人" width="110">
        <template #default="{ row }">{{ row.ownerName || '-' }}</template>
      </el-table-column>

      <el-table-column label="成员数" width="90" align="right">
        <template #default="{ row }">{{ row.memberCount.toLocaleString('zh-CN') }}</template>
      </el-table-column>

      <el-table-column label="活跃度" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="activityTagType[row.activityLevel] ?? 'info'" size="small">
            {{ activityLabels[row.activityLevel] ?? row.activityLevel }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="标签" min-width="160">
        <template #default="{ row }">
          <template v-if="row.tags?.length">
            <el-tag v-for="tag in row.tags" :key="tag" size="small" effect="plain" class="tag-item">
              {{ tag }}
            </el-tag>
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column label="来源" width="110">
        <template #default="{ row }">{{ row.source || '-' }}</template>
      </el-table-column>

      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="emit('view', row)">查看</el-button>
          <el-button link type="primary" size="small" @click="emit('edit', row)">编辑</el-button>
          <el-button
            v-if="row.isActive"
            link
            type="warning"
            size="small"
            @click="emit('disable', row)"
          >
            停用
          </el-button>
          <el-button link type="danger" size="small" @click="emit('delete', row)">删除</el-button>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty description="暂无社群数据" :image-size="100" />
      </template>
    </el-table>

    <div class="table-footer">
      <el-pagination
        background
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="(nextPage: number) => emit('update:page', nextPage)"
        @size-change="(nextSize: number) => emit('update:pageSize', nextSize)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CommunityGroupEntity } from '@content/shared';

type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger';

interface TablePagination {
  current: number;
  pageSize: number;
  total: number;
}

withDefaults(
  defineProps<{
    communities: CommunityGroupEntity[];
    loading?: boolean;
    pagination: TablePagination;
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  view: [community: CommunityGroupEntity];
  edit: [community: CommunityGroupEntity];
  delete: [community: CommunityGroupEntity];
  disable: [community: CommunityGroupEntity];
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
}>();

const groupTypeLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

const activityLabels: Record<string, string> = {
  high: '高活跃',
  medium: '中活跃',
  low: '低活跃'
};

const activityTagType: Record<string, TagType> = {
  high: 'success',
  medium: 'warning',
  low: 'info'
};

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<style scoped>
.community-library-table {
  width: 100%;
}

.community-table {
  width: 100%;
}

.tag-item {
  margin-right: 4px;
}

.tag-item:last-child {
  margin-right: 0;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

<template>
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
</template>
<script setup lang="ts">
import { inventoryTagType, operationTagType, salesTagType } from '../../../utils/labels';
</script>

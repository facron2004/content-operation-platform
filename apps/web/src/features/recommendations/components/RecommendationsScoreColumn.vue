<template>
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
</template>
<script setup lang="ts">
import { levelTagType, scoreTooltip } from '../../../utils/labels';
</script>

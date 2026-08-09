<template>
  <el-table v-loading="loading" :data="items" stripe style="width: 100%" empty-text="暂无用户数据">
    <el-table-column label="用户名" prop="username" min-width="120" />
    <el-table-column label="显示名称" prop="displayName" min-width="120" />
    <el-table-column label="邮箱" min-width="160">
      <template #default="{ row }">{{ row.email || '-' }}</template>
    </el-table-column>
    <el-table-column label="手机" min-width="120">
      <template #default="{ row }">{{ row.phone || '-' }}</template>
    </el-table-column>
    <el-table-column label="角色" min-width="220">
      <template #default="{ row }">
        <el-tag
          v-for="(role, index) in row.roles ?? []"
          :key="`${role.role}-${role.scopeId ?? ''}-${index}`"
          size="small"
          style="margin-right: 4px; margin-bottom: 2px"
        >
          {{ formatRoleTag(role) }}
        </el-tag>
        <span v-if="!row.roles?.length">—</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="80">
      <template #default="{ row }">
        <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
          {{ row.isActive ? '启用' : '停用' }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="最后登录" width="160">
      <template #default="{ row }">{{ row.lastLoginAt || '-' }}</template>
    </el-table-column>
    <el-table-column label="操作" min-width="220" width="240" fixed="right">
      <template #default="{ row }">
        <div class="action-cell">
          <AppleButton variant="ghost" size="sm" @click="$emit('edit', row)">编辑</AppleButton>
          <AppleButton variant="ghost" size="sm" @click="$emit('access', row)">授权</AppleButton>
          <AppleButton
            v-if="row.isActive"
            variant="ghost"
            data-tone="warning"
            size="sm"
            @click="$emit('deactivate', row)"
          >
            停用
          </AppleButton>
          <AppleButton
            v-else
            variant="ghost"
            data-tone="success"
            size="sm"
            @click="$emit('activate', row)"
          >
            启用
          </AppleButton>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import AppleButton from '../../components/AppleButton.vue';
import { formatRoleTag, type UserRow } from './types';

defineProps<{
  items: UserRow[];
  loading: boolean;
}>();

defineEmits<{
  edit: [row: UserRow];
  access: [row: UserRow];
  deactivate: [row: UserRow];
  activate: [row: UserRow];
}>();
</script>

<style scoped>
.action-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
</style>

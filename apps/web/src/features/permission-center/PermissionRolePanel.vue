<template>
  <section class="iam-surface">
    <div class="iam-section-head">
      <div>
        <p class="iam-eyebrow">01 / ROLE CATALOG</p>
        <h3>角色与权限</h3>
        <p>系统角色来自迁移种子；自定义角色可以在当前租户内组合已登记权限。</p>
      </div>
      <AppleButton variant="primary" size="sm" @click="openRoleCreate">
        <template #icon>
          <el-icon><Plus /></el-icon>
        </template>
        新建角色
      </AppleButton>
    </div>

    <div class="iam-role-grid">
      <div class="iam-list-panel">
        <button
          v-for="role in roles"
          :key="role.roleId"
          class="iam-role-row"
          :class="{ selected: selectedRoleId === role.roleId }"
          type="button"
          @click="selectRole(role)"
        >
          <span class="role-mark" :class="{ system: role.isSystemTemplate }">
            {{ role.code.slice(0, 1).toUpperCase() }}
          </span>
          <span class="role-row-copy">
            <strong>{{ role.name }}</strong>
            <small>{{ role.code }}</small>
          </span>
          <el-tag size="small" :type="role.isSystemTemplate ? 'info' : 'success'">
            {{ role.isSystemTemplate ? '系统' : '自定义' }}
          </el-tag>
        </button>
        <div v-if="!roles.length && !loading" class="iam-empty">暂无角色目录</div>
      </div>

      <div v-if="selectedRole" class="iam-detail-panel">
        <div class="detail-topline">
          <div>
            <span class="detail-code">{{ selectedRole.code }}</span>
            <h4>{{ selectedRole.name }}</h4>
          </div>
          <el-tag :type="selectedRole.isActive ? 'success' : 'danger'" effect="plain">
            {{ selectedRole.isActive ? '启用中' : '已停用' }}
          </el-tag>
        </div>
        <p class="detail-description">{{ selectedRole.description || '未填写角色说明。' }}</p>
        <div class="permission-heading">
          <span>权限清单</span>
          <small>{{ permissionDraft.length }} / {{ permissions.length }} granted</small>
        </div>
        <el-checkbox-group v-model="permissionDraft" class="permission-grid">
          <el-checkbox
            v-for="permission in permissions"
            :key="permission.code"
            :value="permission.code"
          >
            <span>{{ permission.name }}</span>
            <small>{{ permission.code }}</small>
          </el-checkbox>
        </el-checkbox-group>
        <div class="detail-actions">
          <AppleButton
            variant="primary"
            size="sm"
            :loading="savingRole"
            :disabled="selectedRole.isSystemTemplate === 1"
            @click="saveRolePermissions"
          >
            保存授权
          </AppleButton>
          <AppleButton variant="ghost" size="sm" @click="openRoleClone">复制为自定义</AppleButton>
          <AppleButton
            variant="ghost"
            size="sm"
            @click="permissionDraft = rolePermissionCodes(selectedRole)"
          >
            撤销修改
          </AppleButton>
        </div>
      </div>
      <div v-else class="iam-detail-panel iam-empty">选择左侧角色查看权限。</div>
    </div>

    <el-dialog
      v-model="roleDialogVisible"
      title="新建租户角色"
      width="520px"
      @close="invalidateRoleMutation"
    >
      <el-form :model="roleForm" label-width="88px">
        <el-form-item label="角色编码">
          <el-input v-model="roleForm.code" placeholder="例如 content_reviewer" />
        </el-form-item>
        <el-form-item label="角色名称">
          <el-input v-model="roleForm.name" placeholder="例如 内容审阅员" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="roleForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="初始权限">
          <el-checkbox-group v-model="roleForm.permissionCodes" class="dialog-permissions">
            <el-checkbox
              v-for="permission in permissions"
              :key="permission.code"
              :value="permission.code"
            >
              {{ permission.name }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <AppleButton variant="primary" :loading="savingRole" @click="createRole">
          创建角色
        </AppleButton>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import AppleButton from '../../components/AppleButton.vue';
import type { PermissionCenterController } from './usePermissionCenter';

const props = defineProps<{ controller: PermissionCenterController }>();
const {
  loading,
  roles,
  permissions,
  selectedRoleId,
  permissionDraft,
  selectedRole,
  savingRole,
  roleDialogVisible,
  roleForm,
  rolePermissionCodes,
  selectRole,
  openRoleCreate,
  openRoleClone,
  invalidateRoleMutation,
  saveRolePermissions,
  createRole
} = props.controller;
</script>

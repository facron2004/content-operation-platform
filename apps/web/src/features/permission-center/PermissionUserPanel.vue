<template>
  <section class="iam-surface">
    <div class="iam-section-head">
      <div>
        <p class="iam-eyebrow">03 / USER ACCESS</p>
        <h3>用户授权</h3>
        <p>替换用户的角色授权和组织成员关系，变更会同步令牌版本并保留审计记录。</p>
      </div>
    </div>
    <div class="user-access-toolbar">
      <el-input
        v-model="userKeyword"
        clearable
        placeholder="按用户名或姓名搜索"
        class="user-search"
        @keyup.enter="searchUsers"
        @clear="searchUsers"
      />
      <AppleButton variant="secondary" size="sm" :loading="userSearchLoading" @click="searchUsers">
        搜索
      </AppleButton>
      <el-select
        v-model="selectedUserId"
        filterable
        placeholder="选择用户"
        class="user-picker"
        @change="loadUserAccess"
      >
        <el-option
          v-for="user in users"
          :key="user.userId"
          :label="`${user.displayName || user.username} · ${user.username}`"
          :value="user.userId"
        />
      </el-select>
      <span v-if="selectedAccess" class="access-summary">
        {{ selectedAccess.permissions.length }} permissions ·
        {{ selectedAccess.memberships.length }} memberships
      </span>
    </div>
    <p v-if="userListTruncated" class="list-cap-hint">
      当前用户选择器加载 {{ users.length }} / {{ usersTotal }} 位；请用上方搜索定位未加载用户。
    </p>

    <div v-if="selectedAccess" class="access-board">
      <div class="access-column">
        <div class="column-title">
          <span>角色授权</span>
          <AppleButton variant="ghost" size="sm" @click="addAssignment">+ 添加</AppleButton>
        </div>
        <div v-for="(assignment, index) in assignmentDraft" :key="index" class="assignment-row">
          <el-select v-model="assignment.roleCode" placeholder="角色" size="small">
            <el-option
              v-for="role in roles"
              :key="role.code"
              :label="role.name"
              :value="role.code"
            />
          </el-select>
          <el-select
            v-model="assignment.scopeType"
            placeholder="范围"
            size="small"
            @change="setAssignmentScope(index, assignment.scopeType)"
          >
            <el-option label="全部" value="ALL" />
            <el-option label="组织树" value="ORG_TREE" />
            <el-option label="仅本组织" value="ORG_ONLY" />
            <el-option label="无范围" value="NONE" />
          </el-select>
          <el-select
            v-if="assignment.scopeType === 'ORG_TREE' || assignment.scopeType === 'ORG_ONLY'"
            v-model="assignment.orgUnitId"
            placeholder="组织"
            size="small"
            class="assignment-org"
          >
            <el-option
              v-for="org in organizations"
              :key="org.unitId"
              :label="org.name"
              :value="org.unitId"
            />
          </el-select>
          <AppleButton
            variant="quiet"
            size="sm"
            icon-only
            aria-label="移除授权"
            @click="assignmentDraft.splice(index, 1)"
          >
            ×
          </AppleButton>
        </div>
        <div v-if="!assignmentDraft.length" class="inline-empty">还没有角色授权。</div>
      </div>
      <div class="access-column">
        <div class="column-title">
          <span>组织成员关系</span>
          <small>{{ membershipDraft.length }} selected</small>
        </div>
        <el-select
          v-model="membershipDraft"
          multiple
          filterable
          collapse-tags
          placeholder="选择组织"
          class="membership-picker"
        >
          <el-option
            v-for="org in organizations"
            :key="org.unitId"
            :label="org.name"
            :value="org.unitId"
          />
        </el-select>
        <div class="primary-org-label">主组织</div>
        <el-select
          v-model="primaryOrgUnitId"
          clearable
          placeholder="选择主组织"
          class="membership-picker"
        >
          <el-option
            v-for="org in organizations.filter((item) => membershipDraft.includes(item.unitId))"
            :key="org.unitId"
            :label="org.name"
            :value="org.unitId"
          />
        </el-select>
        <div class="membership-chips">
          <el-tag v-for="orgId in membershipDraft" :key="orgId" size="small" effect="plain">
            {{ organizationName(orgId) }}
          </el-tag>
        </div>
      </div>
    </div>
    <div v-else class="iam-empty access-empty">选择用户后编辑其授权。</div>
    <div v-if="selectedAccess" class="access-footer">
      <span>保存后旧版角色接口仍可读取兼容绑定。</span>
      <AppleButton variant="primary" :loading="savingAccess" @click="saveUserAccess">
        保存用户授权
      </AppleButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppleButton from '../../components/AppleButton.vue';
import type { PermissionCenterController } from './usePermissionCenter';

const props = defineProps<{ controller: PermissionCenterController }>();
const {
  users,
  usersTotal,
  userKeyword,
  userSearchLoading,
  userListTruncated,
  roles,
  organizations,
  selectedUserId,
  selectedAccess,
  assignmentDraft,
  membershipDraft,
  primaryOrgUnitId,
  savingAccess,
  loadUserAccess,
  addAssignment,
  setAssignmentScope,
  organizationName,
  searchUsers,
  saveUserAccess
} = props.controller;
</script>

<style scoped>
.user-access-toolbar {
  flex-wrap: wrap;
}
.user-search {
  width: 220px;
}
.list-cap-hint {
  margin: 10px 0 0;
  padding: 6px 10px;
  border: 1px solid #f1d69a;
  border-radius: 8px;
  background: #fff8e8;
  color: #8a5a00;
  font-size: 12px;
}
@media (max-width: 720px) {
  .user-search,
  .user-picker {
    width: 100%;
  }
}
</style>

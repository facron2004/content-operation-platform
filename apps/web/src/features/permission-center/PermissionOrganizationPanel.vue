<template>
  <section class="iam-surface">
    <div class="iam-section-head">
      <div>
        <p class="iam-eyebrow">02 / ORGANIZATION TREE</p>
        <h3>组织树</h3>
        <p>总部 → 区域 → 商家的层级是数据范围的承载骨架。</p>
      </div>
      <AppleButton variant="primary" size="sm" @click="openOrganizationCreate">
        <template #icon>
          <el-icon><Plus /></el-icon>
        </template>
        新建组织
      </AppleButton>
    </div>
    <el-table
      v-loading="loading"
      :data="organizationTree"
      row-key="unitId"
      class="iam-table"
      :tree-props="{ children: 'children' }"
      empty-text="暂无组织单元"
    >
      <el-table-column label="组织名称" min-width="260">
        <template #default="{ row }">
          <div class="org-cell">
            <span class="org-type-mark" :class="row.unitType.toLowerCase()" />
            <div>
              <strong>{{ row.name }}</strong>
              <small>{{ row.code }}</small>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="层级" width="110">
        <template #default="{ row }">{{ orgTypeLabel(row.unitType) }}</template>
      </el-table-column>
      <el-table-column label="业务绑定" min-width="180">
        <template #default="{ row }">
          {{ row.areaId || row.merchantId || '平台节点' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <AppleButton variant="ghost" size="sm" @click="openOrganizationEdit(row)">
            编辑
          </AppleButton>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="organizationDialogVisible"
      :title="editingOrganization ? '编辑组织单元' : '新建组织单元'"
      width="520px"
      @close="invalidateOrganizationMutation"
    >
      <el-form :model="organizationForm" label-width="88px">
        <el-form-item label="编码">
          <el-input v-model="organizationForm.code" :disabled="Boolean(editingOrganization)" />
        </el-form-item>
        <el-form-item label="名称"><el-input v-model="organizationForm.name" /></el-form-item>
        <el-form-item v-if="!editingOrganization" label="类型">
          <el-radio-group v-model="organizationForm.unitType">
            <el-radio-button label="REGION">区域</el-radio-button>
            <el-radio-button label="MERCHANT">商家</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!editingOrganization" label="父组织">
          <el-select v-model="organizationForm.parentId" clearable placeholder="默认总部">
            <el-option
              v-for="org in organizations"
              :key="org.unitId"
              :label="org.name"
              :value="org.unitId"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="organizationForm.unitType === 'REGION'" label="areaId">
          <el-input v-model="organizationForm.areaId" />
        </el-form-item>
        <el-form-item v-if="organizationForm.unitType === 'MERCHANT'" label="merchantId">
          <el-input v-model="organizationForm.merchantId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <AppleButton variant="primary" :loading="savingOrganization" @click="saveOrganization">
          保存组织
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
  organizations,
  organizationTree,
  organizationDialogVisible,
  editingOrganization,
  organizationForm,
  savingOrganization,
  orgTypeLabel,
  openOrganizationEdit,
  openOrganizationCreate,
  invalidateOrganizationMutation,
  saveOrganization
} = props.controller;
</script>

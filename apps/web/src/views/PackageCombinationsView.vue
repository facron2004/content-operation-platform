<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createPackageCombination,
  listPackageCombinations,
  listPackageOptions,
  updatePackageCombinationStatus,
  type PackageCombination,
  type PackageOption
} from '../services/api/gap-center.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';
import { canWritePackages as resolveCanWritePackages } from '../features/write-action-permissions';
import { useRoleStore } from '../stores/role';

const roleStore = useRoleStore();
const canWritePackages = computed(() =>
  resolveCanWritePackages(roleStore.effectiveRoles, roleStore.permissions)
);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const items = ref<PackageCombination[]>([]);
const options = ref<PackageOption[]>([]);
const createVisible = ref(false);
const page = ref(1);
const search = ref('');
const form = reactive({
  combinationName: '',
  priceYuan: '',
  inventoryRule: 'shared' as 'shared' | 'independent',
  purchaseLimit: 1,
  validStartAt: '',
  validEndAt: '',
  packageIds: [] as string[]
});

const selectedOptions = computed(() => options.value.filter((item) => form.packageIds.includes(item.packageId)));

function money(fen: string | number) {
  return `¥${(Number(fen) / 100).toFixed(2)}`;
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '长期有效';
}

function resetForm() {
  Object.assign(form, {
    combinationName: '',
    priceYuan: '',
    inventoryRule: 'shared',
    purchaseLimit: 1,
    validStartAt: '',
    validEndAt: '',
    packageIds: []
  });
}

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const [pageData, packageData] = await Promise.all([
      listPackageCombinations({ search: search.value.trim() || undefined, page: page.value, pageSize: 50 }),
      listPackageOptions()
    ]);
    items.value = pageData.items;
    options.value = packageData;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '组合套餐加载失败';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  if (!canWritePackages.value) return;
  resetForm();
  createVisible.value = true;
}

async function submitCreate() {
  if (!canWritePackages.value) return;
  if (!form.combinationName.trim() || !form.priceYuan || form.packageIds.length < 2) {
    ElMessage.warning('请填写名称、价格并至少选择两个子套餐');
    return;
  }
  saving.value = true;
  try {
    await createPackageCombination(
      {
        combinationName: form.combinationName.trim(),
        priceFen: Math.round(Number(form.priceYuan) * 100),
        inventoryRule: form.inventoryRule,
        purchaseLimit: form.purchaseLimit || undefined,
        validStartAt: form.validStartAt || undefined,
        validEndAt: form.validEndAt || undefined,
        items: form.packageIds.map((packageId) => ({ packageId, quantity: 1, required: true }))
      },
      buildBusinessIntentKey('package-combination', form.combinationName.trim(), Date.now())
    );
    ElMessage.success('组合套餐已创建');
    createVisible.value = false;
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '组合套餐创建失败');
  } finally {
    saving.value = false;
  }
}

async function toggle(row: PackageCombination) {
  if (!canWritePackages.value) return;
  try {
    await updatePackageCombinationStatus(
      row.combinationId,
      row.status === 'active' ? 'disabled' : 'active',
      buildBusinessIntentKey('package-combination', row.combinationId, row.status, Date.now())
    );
    ElMessage.success(row.status === 'active' ? '组合套餐已停用' : '组合套餐已启用');
    await reload();
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '状态更新失败');
  }
}

onMounted(() => void reload());
</script>

<template>
  <section v-loading="loading" class="page-stack gap-page">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">刷新</el-button>
      <el-button v-if="canWritePackages" type="primary" @click="openCreate">新建组合</el-button>
    </div>
    <ErrorAlert :message="error" />
    <section class="panel">
      <div class="section-heading">
        <div><p class="eyebrow">CATALOG</p><h2>组合列表</h2></div>
        <span class="section-meta">{{ items.length }} 条</span>
      </div>
      <div class="gap-toolbar">
        <el-input v-model="search" clearable placeholder="搜索组合名称" @keyup.enter="reload" />
        <el-button type="primary" @click="reload">查询</el-button>
      </div>
      <el-table :data="items" row-key="combinationId">
        <el-table-column label="组合套餐" min-width="190">
          <template #default="{ row }"><strong>{{ row.combinationName }}</strong><small class="muted">{{ row.combinationId }}</small></template>
        </el-table-column>
        <el-table-column label="子套餐" min-width="260">
          <template #default="{ row }"><div class="tag-list"><el-tag v-for="item in row.items" :key="item.itemId" size="small" effect="plain">{{ item.package?.packageName || item.packageId }} ×{{ item.quantity }}</el-tag></div></template>
        </el-table-column>
        <el-table-column label="售价" width="120" align="right"><template #default="{ row }">{{ money(row.priceFen) }}</template></el-table-column>
        <el-table-column label="库存规则" width="120"><template #default="{ row }">{{ row.inventoryRule === 'shared' ? '共享库存' : '独立库存' }}</template></el-table-column>
        <el-table-column label="有效期" width="170"><template #default="{ row }">{{ date(row.validStartAt) }} - {{ date(row.validEndAt) }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column v-if="canWritePackages" label="操作" width="100"><template #default="{ row }"><el-button text size="small" @click="toggle(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无组合套餐" />
    </section>

    <el-dialog v-if="canWritePackages" v-model="createVisible" title="新建组合套餐" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="组合名称" required><el-input v-model="form.combinationName" maxlength="160" /></el-form-item>
        <el-form-item label="售价（元）" required><el-input v-model="form.priceYuan" inputmode="decimal" /></el-form-item>
        <el-form-item label="子套餐（至少两个）" required><el-select v-model="form.packageIds" multiple filterable collapse-tags style="width: 100%"><el-option v-for="item in options" :key="item.packageId" :label="`${item.packageName}（库存 ${item.stockLeft}）`" :value="item.packageId" /></el-select></el-form-item>
        <div v-if="selectedOptions.length" class="selected-package-note">{{ selectedOptions.map((item) => item.packageName).join('、') }}</div>
        <el-form-item label="库存规则"><el-radio-group v-model="form.inventoryRule"><el-radio value="shared">共享库存</el-radio><el-radio value="independent">独立库存</el-radio></el-radio-group></el-form-item>
        <el-form-item label="每人限购"><el-input-number v-model="form.purchaseLimit" :min="1" :max="999" /></el-form-item>
        <div class="form-grid"><el-form-item label="开始日期"><el-date-picker v-model="form.validStartAt" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="结束日期"><el-date-picker v-model="form.validEndAt" type="date" value-format="YYYY-MM-DD" /></el-form-item></div>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.gap-page { min-width: 0; }
.gap-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.gap-toolbar { margin: 16px 0; }
.gap-toolbar .el-input { width: 280px; max-width: 100%; }
.section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.section-heading h2 { margin: 4px 0 0; }
.section-meta, .muted { color: var(--muted); font-size: 12px; }
.muted { display: block; margin-top: 4px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 5px; }
.selected-package-note { margin: -8px 0 14px; color: var(--muted); font-size: 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 760px) { .form-grid { grid-template-columns: 1fr; } }
</style>

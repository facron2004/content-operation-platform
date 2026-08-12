<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createStore,
  listStoreMerchantOptions,
  listStores,
  type StoreItem,
  type StoreMerchantOption
} from '../services/api/gap-center.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const items = ref<StoreItem[]>([]);
const merchants = ref<StoreMerchantOption[]>([]);
const search = ref('');
const status = ref('');
const createVisible = ref(false);
const form = reactive({ merchantId: '', storeName: '', address: '', areaName: '', contactName: '', contactPhone: '', businessHours: '' });

function resetForm() { Object.assign(form, { merchantId: '', storeName: '', address: '', areaName: '', contactName: '', contactPhone: '', businessHours: '' }); }

async function reload() {
  loading.value = true; error.value = null;
  try {
    const [storeData, merchantData] = await Promise.all([
      listStores({ search: search.value.trim() || undefined, status: status.value || undefined, page: 1, pageSize: 100 }),
      listStoreMerchantOptions()
    ]);
    items.value = storeData.items; merchants.value = merchantData;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '门店加载失败'; }
  finally { loading.value = false; }
}

function openCreate() { resetForm(); createVisible.value = true; }

async function submitCreate() {
  if (!form.merchantId || !form.storeName.trim()) { ElMessage.warning('请选择商家并填写门店名称'); return; }
  saving.value = true;
  try {
    await createStore({ ...form, address: form.address || undefined, areaName: form.areaName || undefined, contactName: form.contactName || undefined, contactPhone: form.contactPhone || undefined, businessHours: form.businessHours || undefined }, buildBusinessIntentKey('store', form.merchantId, form.storeName.trim(), Date.now()));
    ElMessage.success('门店已创建'); createVisible.value = false; await reload();
  } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : '门店创建失败'); }
  finally { saving.value = false; }
}

onMounted(() => void reload());
</script>

<template>
  <section v-loading="loading" class="page-stack gap-page">
    <div class="panel gap-hero"><div><p class="eyebrow">V2.0 / STORE MANAGEMENT</p><h1>门店管理</h1><p class="hero-description">展示已持久化门店与商家主地址投影，避免把商家档案误当成完整门店记录。</p></div><div class="gap-actions"><el-button :loading="loading" @click="reload">刷新</el-button><el-button type="primary" @click="openCreate">新建门店</el-button></div></div>
    <ErrorAlert :message="error" />
    <section class="panel"><div class="section-heading"><div><p class="eyebrow">STORE DIRECTORY</p><h2>门店列表</h2></div><span class="section-meta">{{ items.length }} 条</span></div>
      <div class="gap-toolbar"><el-input v-model="search" clearable placeholder="搜索门店、商家或地址" @keyup.enter="reload" /><el-select v-model="status" clearable placeholder="状态" @change="reload"><el-option label="营业中" value="active" /><el-option label="停用" value="disabled" /></el-select><el-button type="primary" @click="reload">查询</el-button></div>
      <el-table :data="items" row-key="storeId"><el-table-column label="门店" min-width="190"><template #default="{ row }"><strong>{{ row.storeName }}</strong><small class="muted">{{ row.merchantName || row.merchantId }}</small></template></el-table-column><el-table-column label="区域" width="130"><template #default="{ row }">{{ row.areaName || '未填写' }}</template></el-table-column><el-table-column label="地址" min-width="230"><template #default="{ row }">{{ row.address || '未填写' }}</template></el-table-column><el-table-column label="联系人" width="150"><template #default="{ row }">{{ row.contactName || '未填写' }}<small v-if="row.contactPhone" class="muted">{{ row.contactPhone }}</small></template></el-table-column><el-table-column label="来源" width="140"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.source === 'merchant_projection' ? 'warning' : 'success'">{{ row.source === 'merchant_projection' ? '商家档案投影' : '门店记录' }}</el-tag></template></el-table-column><el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '营业中' : '停用' }}</el-tag></template></el-table-column></el-table>
      <el-empty v-if="!loading && !items.length" description="暂无门店或商家档案" />
    </section>
    <el-dialog v-model="createVisible" title="新建门店" width="560px" :close-on-click-modal="false"><el-form label-position="top"><el-form-item label="所属商家" required><el-select v-model="form.merchantId" filterable style="width:100%"><el-option v-for="merchant in merchants" :key="merchant.merchantId" :label="merchant.merchantName" :value="merchant.merchantId" /></el-select></el-form-item><el-form-item label="门店名称" required><el-input v-model="form.storeName" /></el-form-item><el-form-item label="地址"><el-input v-model="form.address" /></el-form-item><div class="form-grid"><el-form-item label="区域"><el-input v-model="form.areaName" /></el-form-item><el-form-item label="营业时间"><el-input v-model="form.businessHours" placeholder="如 09:00-22:00" /></el-form-item></div><div class="form-grid"><el-form-item label="联系人"><el-input v-model="form.contactName" /></el-form-item><el-form-item label="联系电话"><el-input v-model="form.contactPhone" /></el-form-item></div></el-form><template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button></template></el-dialog>
  </section>
</template>

<style scoped>
.gap-page { min-width: 0; }.gap-hero { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }.gap-hero h1 { margin:8px 0; }.gap-actions,.gap-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }.gap-toolbar { margin:16px 0; }.gap-toolbar .el-input { width:280px; max-width:100%; }.section-heading { display:flex; justify-content:space-between; align-items:flex-start; }.section-heading h2 { margin:4px 0 0; }.section-meta,.muted { color:var(--muted); font-size:12px; }.muted { display:block; margin-top:4px; }.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }@media (max-width:760px){.gap-hero{flex-direction:column}.form-grid{grid-template-columns:1fr}}
</style>

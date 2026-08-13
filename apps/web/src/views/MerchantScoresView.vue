<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import { listMerchantScores, recalculateMerchantScore, type MerchantScoreItem } from '../services/api/gap-center.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';
import { canManageMerchants as resolveCanManageMerchants } from '../features/write-action-permissions';
import { useRoleStore } from '../stores/role';

const roleStore = useRoleStore();
const canManageMerchants = computed(() =>
  resolveCanManageMerchants(roleStore.effectiveRoles, roleStore.permissions)
);
const loading = ref(false);
const error = ref<string | null>(null);
const items = ref<MerchantScoreItem[]>([]);
const search = ref('');
const recalculating = ref<string | null>(null);

function score(value: number | null | undefined) { return value == null ? 'N/A' : value.toFixed(1); }
type ScoreDimensionKey = 'overallScore' | 'tradeScore' | 'fulfillmentScore' | 'refundScore' | 'productScore' | 'campaignScore' | 'riskScore';
function dimension(row: MerchantScoreItem, key: ScoreDimensionKey): number | null | undefined {
  return row.score ? row.score[key] : null;
}
async function reload() {
  loading.value = true; error.value = null;
  try { items.value = (await listMerchantScores({ search: search.value.trim() || undefined, page: 1, pageSize: 100 })).items; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Merchant score loading failed'; }
  finally { loading.value = false; }
}
async function recalculate(row: MerchantScoreItem) {
  if (!canManageMerchants.value) return;
  recalculating.value = row.merchantId;
  try { await recalculateMerchantScore(row.merchantId, buildBusinessIntentKey('merchant-score', row.merchantId, Date.now())); ElMessage.success('Score recalculated'); await reload(); }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : 'Score calculation failed'); }
  finally { recalculating.value = null; }
}
onMounted(() => void reload());
</script>

<template>
  <section v-loading="loading" class="page-stack gap-page">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="reload">刷新</el-button>
    </div>
    <ErrorAlert :message="error" />
    <section class="panel"><div class="section-heading"><div><p class="eyebrow">QUALITY BOARD</p><h2>商家评分明细</h2></div><span class="section-meta">{{ items.length }} 条</span></div>
      <div class="gap-toolbar"><el-input v-model="search" clearable placeholder="搜索商家名称" @keyup.enter="reload" /><el-button type="primary" @click="reload">查询</el-button></div>
      <el-table :data="items" row-key="merchantId">
        <el-table-column label="商家" min-width="190"><template #default="{ row }"><strong>{{ row.merchantName }}</strong><small class="muted">{{ row.areaName || row.merchantId }}</small></template></el-table-column>
        <el-table-column label="综合" width="100" align="center"><template #default="{ row }"><span class="score-main">{{ score(dimension(row, 'overallScore')) }}</span></template></el-table-column>
        <el-table-column label="交易" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'tradeScore')) }}</template></el-table-column>
        <el-table-column label="履约" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'fulfillmentScore')) }}</template></el-table-column>
        <el-table-column label="售后" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'refundScore')) }}</template></el-table-column>
        <el-table-column label="商品" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'productScore')) }}</template></el-table-column>
        <el-table-column label="活动" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'campaignScore')) }}</template></el-table-column>
        <el-table-column label="风险" width="90" align="center"><template #default="{ row }">{{ score(dimension(row, 'riskScore')) }}</template></el-table-column>
        <el-table-column label="来源" width="130"><template #default="{ row }">{{ row.score?.source === 'live_calculation' ? '实时计算' : row.score?.source || '未计算' }}</template></el-table-column>
        <el-table-column v-if="canManageMerchants" label="操作" width="120"><template #default="{ row }"><el-button text size="small" :loading="recalculating === row.merchantId" @click="recalculate(row)">重新计算</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="暂无商家评分数据" />
    </section>
  </section>
</template>

<style scoped>
.gap-page{min-width:0}.gap-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gap-toolbar{margin:16px 0}.gap-toolbar .el-input{width:280px;max-width:100%}.section-heading{display:flex;justify-content:space-between;align-items:flex-start}.section-heading h2{margin:4px 0 0}.section-meta,.muted{color:var(--muted);font-size:12px}.muted{display:block;margin-top:4px}.score-main{font-size:20px;font-weight:750;color:var(--accent)}
</style>

<template>
  <section class="panel">
    <header>
      <!-- Residual #285: title reflects Top-N head when server limit is known. -->
      <h4>
        同区域同品类竞品{{ limitLabel ? `（Top ${limitLabel}）` : '' }}{{ truncated ? '+' : '' }}
      </h4>
    </header>
    <!-- Residual #285: MERCHANT_COMPETITORS_LIMIT silent-cap honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      仅展示 SKU 数最高的前 {{ limitLabel }} 组同区域同品类竞品（至少匹配
      {{ matchedLabel }} 组），完整竞品池未加载。
    </p>
    <el-table :data="competitors" size="small" max-height="240" empty-text="暂无竞品数据">
      <el-table-column prop="merchantName" label="竞品商家" min-width="160" />
      <el-table-column prop="category" label="品类" width="100" />
      <el-table-column label="SKU 数" width="90" align="right" prop="skuCount" />
      <el-table-column label="均价" width="100" align="right">
        <template #default="{ row }">
          ¥ {{ row.skuCount > 0 ? (row.totalPrice / row.skuCount).toFixed(2) : '—' }}
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(
  defineProps<{
    competitors: Array<{
      merchantName: string;
      category: string;
      skuCount: number;
      totalPrice: number;
    }>;
    // Residual #285: MERCHANT_COMPETITORS_LIMIT honesty.
    truncated?: boolean;
    limit?: number | null;
    matched?: number | null;
  }>(),
  {
    truncated: false,
    limit: null,
    matched: null
  }
);
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : props.competitors.length
);
const matchedLabel = computed(() =>
  typeof props.matched === 'number' && props.matched > 0 ? props.matched : limitLabel.value
);
</script>
<style scoped>
.list-cap-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>

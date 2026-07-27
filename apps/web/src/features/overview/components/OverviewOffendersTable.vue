<template>
  <section class="panel top-offenders">
    <header>
      <!-- Residual #287: title reflects Top-N head when server limit is known. -->
      <h3>
        Top{{ limitLabel ? ` ${limitLabel}` : '' }} 零动销商家{{ truncated ? '+' : '' }}（stale_30d
        SKU 数降序）
      </h3>
      <AppleButton variant="ghost" size="sm" @click="$emit('go-zero-sales')">
        <template #icon>
          <el-icon><ArrowRight /></el-icon>
        </template>
        查看完整清单
      </AppleButton>
    </header>
    <!-- Residual #287: top-offenders LIMIT honesty. -->
    <p v-if="truncated" class="list-cap-hint">
      仅展示 stale_30d SKU 最高的前 {{ limitLabel }} 家商家（至少匹配 {{ matchedLabel }}
      家），完整清单请点「查看完整清单」。
    </p>
    <el-table
      v-loading="loading"
      :data="items"
      :empty-text="emptyText"
      size="small"
      :row-class-name="rowClass"
    >
      <OverviewOffendersColumns @go-zero-sales="$emit('go-zero-sales', $event)" />
    </el-table>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import type { OverviewTopOffender } from '../../../services/api/overview.api';
import OverviewOffendersColumns from './OverviewOffendersColumns.vue';
import AppleButton from '../../../components/AppleButton.vue';
const props = withDefaults(
  defineProps<{
    items: OverviewTopOffender[];
    loading: boolean;
    emptyText: string;
    rowClass: (args: { row: OverviewTopOffender }) => string;
    // Residual #287: Top-N honesty.
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
defineEmits<{ 'go-zero-sales': [merchantId?: string] }>();
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : props.items.length
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

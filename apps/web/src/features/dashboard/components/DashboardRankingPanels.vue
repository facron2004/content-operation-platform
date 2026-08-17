<template>
  <div class="dashboard-ranking-grid">
    <section class="dashboard-panel ranking-panel">
      <div class="dashboard-panel__header dashboard-panel__header--compact">
        <div>
          <div class="dashboard-section-label">05 / MERCHANTS</div>
          <h2>商家经营排行</h2>
          <p>不只看销售额，也看履约和退款健康度。</p>
        </div>
        <button type="button" class="dashboard-text-action" @click="$emit('open-merchants')">
          查看全部
          <ArrowRight />
        </button>
      </div>
      <div class="ranking-table ranking-table--merchant">
        <div class="ranking-table__head">
          <span>商家</span>
          <span>GMV</span>
          <span>订单</span>
          <span>核销率</span>
          <span>健康度</span>
        </div>
        <button
          v-for="(item, index) in merchants"
          :key="item.name"
          type="button"
          class="ranking-table__row"
          @click="$emit('open-merchant', item.name)"
        >
          <span class="ranking-table__name">
            <i>{{ index + 1 }}</i>
            {{ item.name }}
            <small>{{ item.area }}</small>
          </span>
          <strong>{{ money(item.gmv) }}</strong>
          <span>{{ count(item.orders) }}</span>
          <span>{{ item.verifyRate }}%</span>
          <span class="health-pill" :class="`is-${healthClass(item.health)}`">
            {{ item.health }}
          </span>
        </button>
        <div v-if="!merchants.length" class="dashboard-empty">暂无真实商家数据</div>
      </div>
    </section>

    <section class="dashboard-panel ranking-panel">
      <div class="dashboard-panel__header dashboard-panel__header--compact">
        <div>
          <div class="dashboard-section-label">05 / PACKAGES</div>
          <h2>套餐运营排行</h2>
          <p>热销、增长、异常和库存状态一起看。</p>
        </div>
        <button type="button" class="dashboard-text-action" @click="$emit('open-packages')">
          套餐中心
          <ArrowRight />
        </button>
      </div>
      <div
        class="dashboard-tab-row dashboard-tab-row--ranking"
        role="tablist"
        aria-label="套餐排行维度"
      >
        <button
          v-for="item in packageTabs"
          :key="item.value"
          type="button"
          :class="{ 'is-active': packageTab === item.value }"
          role="tab"
          :aria-selected="packageTab === item.value"
          @click="$emit('update:packageTab', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="packageTab !== 'stock'" class="ranking-table ranking-table--package">
        <div class="ranking-table__head">
          <span>套餐</span>
          <span>售价</span>
          <span>库存</span>
          <span>评分</span>
          <span>标签</span>
        </div>
        <button
          v-for="item in packages"
          :key="item.id"
          type="button"
          class="ranking-table__row"
          @click="$emit('open-package', item.name)"
        >
          <span class="ranking-table__name ranking-table__name--package">
            {{ item.name }}
            <small>{{ item.merchant }}</small>
          </span>
          <strong>{{ money(item.price) }}</strong>
          <span>{{ count(item.stockLeft) }}</span>
          <span>{{ item.score }}</span>
          <span :title="item.tags.join('、')">{{ item.tags[0] || '-' }}</span>
        </button>
        <div v-if="!packages.length" class="dashboard-empty">暂无真实套餐数据</div>
      </div>
      <div v-else class="stock-list">
        <div v-for="item in packages" :key="item.id" class="stock-row">
          <div class="stock-row__copy">
            <strong>{{ item.name }}</strong>
            <span>{{ item.merchant }} · 剩余 {{ item.stockLeft }} 份</span>
          </div>
          <div class="stock-row__status">
            <strong>运营评分 {{ item.score }}</strong>
            <button type="button" @click="$emit('restock', item.name)">查看库存</button>
          </div>
        </div>
        <div v-if="!packages.length" class="dashboard-empty">暂无真实库存关注数据</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';
import type {
  DashboardMerchant,
  DashboardPackage,
  DashboardPackageTab
} from '../operations-dashboard';

defineProps<{
  merchants: DashboardMerchant[];
  packages: DashboardPackage[];
  packageTab: DashboardPackageTab;
}>();

defineEmits<{
  'update:packageTab': [value: DashboardPackageTab];
  'open-merchants': [];
  'open-merchant': [name: string];
  'open-packages': [];
  'open-package': [name: string];
  restock: [name: string];
}>();

const packageTabs: Array<{ label: string; value: DashboardPackageTab }> = [
  { label: '爆品机会', value: 'hot' },
  { label: '必推', value: 'growing' },
  { label: '风险', value: 'risk' },
  { label: '滞销', value: 'stock' }
];

const count = (value: number) => Math.round(value).toLocaleString('zh-CN');
const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;
const healthClass = (value: string) =>
  value === '优秀' ? 'good' : value === '风险' ? 'risk' : 'normal';
</script>

<style scoped>
.dashboard-ranking-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 10px;
}

.ranking-panel {
  min-width: 0;
  padding: 18px 20px 14px;
}

.dashboard-panel__header--compact {
  margin-bottom: 14px;
}

.dashboard-text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-text-action svg {
  width: 13px;
}

.dashboard-tab-row--ranking {
  margin-bottom: 11px;
}

.dashboard-tab-row {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #f5f7fa;
}

.dashboard-tab-row button {
  min-height: 25px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8794a5;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-tab-row button.is-active,
.dashboard-tab-row button:hover {
  background: #fff;
  color: #2772cc;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.1);
}

.ranking-table {
  min-width: 0;
}

.ranking-table__head,
.ranking-table__row {
  display: grid;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ranking-table__head {
  padding: 0 6px 8px;
  border-bottom: 1px solid #edf1f5;
  color: #9aa6b5;
  font-size: 10px;
}

.ranking-table__row {
  width: 100%;
  padding: 10px 6px;
  border: 0;
  border-bottom: 1px solid #f1f3f6;
  background: transparent;
  color: #68788e;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  transition: background 160ms ease;
}

.ranking-table__row:hover {
  background: #f7faff;
}

.ranking-table--merchant .ranking-table__head,
.ranking-table--merchant .ranking-table__row {
  grid-template-columns: minmax(130px, 1.45fr) 0.75fr 0.55fr 0.62fr 0.55fr;
}

.ranking-table--package .ranking-table__head,
.ranking-table--package .ranking-table__row {
  grid-template-columns: minmax(128px, 1.6fr) 0.78fr 0.52fr 0.55fr 0.48fr;
}

.ranking-table__row strong {
  color: #25364c;
  font-family: var(--font-numeric);
  font-size: 11px;
}

.ranking-table__name {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #26384f;
  font-weight: 700;
}

.ranking-table__name i {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border-radius: 5px;
  background: #f0f4f8;
  color: #8593a5;
  font-family: var(--font-numeric);
  font-size: 10px;
  font-style: normal;
}

.ranking-table__name small {
  grid-column: 2;
  margin-top: -3px;
  overflow: hidden;
  color: #9aa6b5;
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-table__name--package {
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.ranking-table__name--package small {
  grid-column: 1;
}

.health-pill {
  justify-self: start;
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.health-pill.is-good {
  background: #e9f8f1;
  color: #11966d;
}

.health-pill.is-normal {
  background: #f2f5f8;
  color: #718096;
}

.health-pill.is-risk {
  background: #fff0ee;
  color: #df5d4e;
}

.is-risk-text {
  color: #de5a4c;
  font-weight: 700;
}

.stock-list {
  display: grid;
  gap: 9px;
}

.stock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid #f1d7d2;
  border-radius: 9px;
  background: #fff9f7;
}

.stock-row__copy,
.stock-row__status {
  display: grid;
  gap: 4px;
}

.stock-row__copy strong {
  color: #2e3b4e;
  font-size: 12px;
}

.stock-row__copy span {
  color: #9a7b75;
  font-size: 10px;
}

.stock-row__status {
  justify-items: end;
}

.stock-row__status strong {
  color: #cf6253;
  font-family: var(--font-numeric);
  font-size: 10px;
  white-space: nowrap;
}

.stock-row__status button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
}

@media (max-width: 1080px) {
  .dashboard-ranking-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ranking-table--merchant .ranking-table__head,
  .ranking-table--merchant .ranking-table__row {
    grid-template-columns: minmax(120px, 1.6fr) 0.8fr 0.6fr 0.7fr;
  }

  .ranking-table--merchant .ranking-table__head span:nth-child(3),
  .ranking-table--merchant .ranking-table__row > span:nth-child(3) {
    display: none;
  }

  .ranking-table--merchant .ranking-table__head,
  .ranking-table--merchant .ranking-table__row {
    grid-template-columns: minmax(120px, 1.55fr) 0.8fr 0.7fr 0.7fr;
  }

  .ranking-table--package .ranking-table__head,
  .ranking-table--package .ranking-table__row {
    grid-template-columns: minmax(120px, 1.5fr) 0.8fr 0.55fr 0.55fr;
  }

  .ranking-table--package .ranking-table__head span:nth-child(3),
  .ranking-table--package .ranking-table__row > span:nth-child(3) {
    display: none;
  }

  .stock-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .stock-row__status {
    justify-items: start;
  }
}
</style>

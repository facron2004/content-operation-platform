<template>
  <section v-loading="loading" class="page-stack user-tags-view">
    <div class="page-toolbar">
      <el-button :loading="loading" @click="loadTags">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="openCreate">新建规则标签</el-button>
    </div>

    <ErrorAlert :message="error" />

    <div class="user-tags-metrics">
      <article class="user-tags-metric panel">
        <span>规则标签</span>
        <strong>{{ ruleTagCount }}</strong>
        <small>保存了筛选条件的标签</small>
      </article>
      <article class="user-tags-metric panel">
        <span>自动关联人数</span>
        <strong>{{ totalMemberships }}</strong>
        <small>当前规则标签关系总量</small>
      </article>
      <article class="user-tags-metric panel">
        <span>自动同步</span>
        <strong>每小时</strong>
        <small>创建后立即执行，之后后台持续重算</small>
      </article>
    </div>

    <section class="panel user-tags-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">RULE DIRECTORY</p>
          <h2>规则标签列表</h2>
        </div>
        <span class="section-meta">共 {{ tags.length }} 个标签</span>
      </div>

      <el-table :data="tags" row-key="tagId">
        <el-table-column label="标签" min-width="220">
          <template #default="{ row }">
            <div class="tag-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.code }} · {{ row.category }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="规则" min-width="310">
          <template #default="{ row }">
            <span class="tag-rule-text">{{ formatRule(row.ruleJson) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.tagType === 'rule' ? 'success' : 'info'">
              {{ row.tagType === 'rule' ? '自动规则' : '手工标签' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="命中人数" width="110" align="right">
          <template #default="{ row }">{{ row.memberCount.toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '运行中' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.tagType === 'rule'" link type="primary" @click="evaluate(row)">
              立即重算
            </el-button>
            <el-button link type="primary" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !tags.length" description="暂无用户标签" :image-size="56" />
    </section>

    <el-dialog v-model="dialogVisible" title="新建规则标签" width="760px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="submitCreate">
        <div class="user-tags-form-grid">
          <el-form-item label="标签名称" required>
            <el-input v-model="form.name" placeholder="例如：高价值复购用户" />
          </el-form-item>
          <el-form-item label="标签编码" required>
            <el-input v-model="form.code" placeholder="例如：high_value_repeat" />
          </el-form-item>
        </div>
        <div class="user-tags-form-grid">
          <el-form-item label="标签分类" required>
            <el-input v-model="form.category" placeholder="例如：用户价值" />
          </el-form-item>
          <el-form-item label="条件关系">
            <el-radio-group v-model="form.logic">
              <el-radio value="and">同时满足（AND）</el-radio>
              <el-radio value="or">满足任一（OR）</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>

        <div class="user-tags-condition-head">
          <div>
            <strong>筛选条件</strong>
            <small>规则保存后会立即筛选用户，后台每小时自动同步</small>
          </div>
          <el-button link type="primary" @click="addCondition">+ 添加条件</el-button>
        </div>
        <div class="user-tags-conditions">
          <div v-for="condition in form.conditions" :key="condition.id" class="user-tags-condition">
            <el-select v-model="condition.field" @change="normalizeOperator(condition)">
              <el-option v-for="item in fieldOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-select v-model="condition.operator">
              <el-option
                v-for="item in operatorsFor(condition.field)"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-input
              v-if="!isNullOperator(condition.operator)"
              v-model="condition.value"
              :placeholder="condition.field === 'paidGmvFen' ? '单位：分' : '输入条件值'"
            />
            <div v-else class="user-tags-null-value">无需填写值</div>
            <el-button
              v-if="form.conditions.length > 1"
              circle
              text
              type="danger"
              @click="removeCondition(condition.id)"
            >
              ×
            </el-button>
          </div>
        </div>

        <div class="user-tags-preview">
          <div>
            <strong>规则预览</strong>
            <span v-if="preview">预计命中 {{ preview.matchedCount.toLocaleString('zh-CN') }} 人</span>
            <span v-else>保存前先预览命中范围</span>
          </div>
          <el-button :loading="previewLoading" @click="previewRule">预览命中用户</el-button>
        </div>
        <div v-if="preview?.sample.length" class="user-tags-sample">
          <span v-for="member in preview.sample" :key="member.memberId">
            {{ member.nickname || member.memberId }}
          </span>
        </div>

        <div class="user-tags-dialog-actions">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" native-type="submit">保存并自动打标</el-button>
        </div>
      </el-form>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createMarketingTag,
  evaluateMarketingTag,
  listMarketingTags,
  previewMarketingTagRule,
  setMarketingTagStatus,
  type MarketingTag,
  type TagRulePreview
} from '../services/api/marketing-private.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';

type RuleField = 'level' | 'pointsBalance' | 'paidOrderCount' | 'paidGmvFen' | 'daysSinceLastPaid';
type RuleOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'is_null'
  | 'is_not_null';
type Condition = { id: number; field: RuleField; operator: RuleOperator; value: string };

const fieldOptions: Array<{ value: RuleField; label: string }> = [
  { value: 'level', label: '用户等级' },
  { value: 'pointsBalance', label: '积分余额' },
  { value: 'paidOrderCount', label: '付费订单数' },
  { value: 'paidGmvFen', label: '付费 GMV（分）' },
  { value: 'daysSinceLastPaid', label: '距最近支付天数' }
];
const numericOperators: Array<{ value: RuleOperator; label: string }> = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' }
];
const stringOperators: Array<{ value: RuleOperator; label: string }> = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' }
];
const nullableOperators: Array<{ value: RuleOperator; label: string }> = [
  ...numericOperators,
  { value: 'is_null', label: '为空' },
  { value: 'is_not_null', label: '不为空' }
];

const tags = ref<MarketingTag[]>([]);
const loading = ref(false);
const submitting = ref(false);
const previewLoading = ref(false);
const error = ref('');
const dialogVisible = ref(false);
const preview = ref<TagRulePreview | null>(null);
let conditionId = 1;
const form = reactive({
  name: '',
  code: '',
  category: '用户运营',
  logic: 'and' as 'and' | 'or',
  conditions: [
    { id: conditionId++, field: 'paidOrderCount' as RuleField, operator: 'gte' as RuleOperator, value: '1' }
  ]
});

const ruleTagCount = computed(() => tags.value.filter((tag) => tag.tagType === 'rule').length);
const totalMemberships = computed(() => tags.value.reduce((sum, tag) => sum + tag.memberCount, 0));

function key() {
  return buildBusinessIntentKey('marketing-tag', Date.now(), Math.random().toString(36).slice(2));
}
function errorMessage(caught: unknown) {
  const response = (caught as { response?: { data?: { message?: string | string[] } } }).response
    ?.data?.message;
  return Array.isArray(response)
    ? response.join('；')
    : response || (caught instanceof Error ? caught.message : '请求失败');
}
async function loadTags() {
  loading.value = true;
  error.value = '';
  try {
    tags.value = (await listMarketingTags({ pageSize: 100 })).items;
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}
function operatorsFor(field: RuleField) {
  if (field === 'level') return stringOperators;
  if (field === 'daysSinceLastPaid' || field === 'paidGmvFen') return nullableOperators;
  return numericOperators;
}
function isNullOperator(operator: RuleOperator) {
  return operator === 'is_null' || operator === 'is_not_null';
}
function normalizeOperator(condition: Condition) {
  if (!operatorsFor(condition.field).some((item) => item.value === condition.operator)) {
    condition.operator = operatorsFor(condition.field)[0].value;
  }
}
function addCondition() {
  form.conditions.push({
    id: conditionId++,
    field: 'paidOrderCount',
    operator: 'gte',
    value: '1'
  });
}
function removeCondition(id: number) {
  form.conditions = form.conditions.filter((condition) => condition.id !== id);
}
function buildRuleJson() {
  return JSON.stringify({
    logic: form.logic,
    conditions: form.conditions.map(({ field, operator, value }) => ({
      field,
      operator,
      ...(isNullOperator(operator) ? {} : { value: value.trim() })
    }))
  });
}
async function previewRule() {
  previewLoading.value = true;
  error.value = '';
  try {
    preview.value = await previewMarketingTagRule(buildRuleJson());
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    previewLoading.value = false;
  }
}
function openCreate() {
  form.name = '';
  form.code = '';
  form.category = '用户运营';
  form.logic = 'and';
  form.conditions = [
    { id: conditionId++, field: 'paidOrderCount', operator: 'gte', value: '1' }
  ];
  preview.value = null;
  dialogVisible.value = true;
}
async function submitCreate() {
  if (!form.name.trim() || !form.code.trim() || !form.category.trim()) {
    error.value = '请填写标签名称、编码和分类';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    await createMarketingTag(
      {
        name: form.name,
        code: form.code,
        category: form.category,
        tagType: 'rule',
        ruleJson: buildRuleJson()
      },
      key()
    );
    ElMessage.success('规则标签已创建并完成首次自动打标');
    dialogVisible.value = false;
    await loadTags();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    submitting.value = false;
  }
}
async function evaluate(row: MarketingTag) {
  try {
    const result = await evaluateMarketingTag(row.tagId, key());
    ElMessage.success(`规则已重算，当前命中 ${result.matchedCount.toLocaleString('zh-CN')} 人`);
    await loadTags();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function toggleStatus(row: MarketingTag) {
  try {
    await setMarketingTagStatus(row.tagId, row.status === 'active' ? 'disabled' : 'active', key());
    await loadTags();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
function formatRule(value: unknown) {
  if (!value || typeof value !== 'object') return '未配置规则';
  const rule = value as { logic?: string; conditions?: Array<{ field?: string; operator?: string; value?: unknown }> };
  const labels = new Map(fieldOptions.map((item) => [item.value, item.label]));
  const operators = new Map(
    [...numericOperators, ...stringOperators, ...nullableOperators].map((item) => [item.value, item.label])
  );
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (!conditions.length) return '未配置规则';
  return conditions
    .map((condition) => `${labels.get(condition.field as RuleField) || condition.field} ${operators.get(condition.operator as RuleOperator) || condition.operator}${isNullOperator(condition.operator as RuleOperator) ? '' : ` ${condition.value ?? ''}`}`)
    .join(rule.logic === 'or' ? ' 或 ' : ' 且 ');
}

onMounted(loadTags);
</script>

<style src="../styles/views/user-tags.css" scoped></style>

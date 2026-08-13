import type { MemberBehaviorFact } from '../common/member-behavior-facts';

export const USER_TAG_RULE_TYPE = 'user-tag';

export const USER_TAG_RULE_FIELDS = [
  'level',
  'pointsBalance',
  'paidOrderCount',
  'paidGmvFen',
  'daysSinceLastPaid'
] as const;

export type UserTagRuleField = (typeof USER_TAG_RULE_FIELDS)[number];
export type UserTagRuleLogic = 'and' | 'or';
export type UserTagRuleOperator =
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

export interface UserTagRuleCondition {
  field: UserTagRuleField;
  operator: UserTagRuleOperator;
  value?: string | number;
}

export interface UserTagRule {
  logic: UserTagRuleLogic;
  conditions: UserTagRuleCondition[];
}

const OPERATORS = new Set<UserTagRuleOperator>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'is_null',
  'is_not_null'
]);
const NULL_OPERATORS = new Set<UserTagRuleOperator>(['is_null', 'is_not_null']);
const NUMERIC_FIELDS = new Set<UserTagRuleField>([
  'pointsBalance',
  'paidOrderCount',
  'paidGmvFen',
  'daysSinceLastPaid'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedValue(field: UserTagRuleField, value: unknown): string | number {
  if (NUMERIC_FIELDS.has(field)) {
    const stringValue = String(value ?? '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(stringValue)) {
      throw new Error(`${field} 的规则值必须是非负数字`);
    }
    if (field === 'paidGmvFen') {
      if (!/^\d+$/.test(stringValue)) throw new Error(`${field} 的规则值必须是整数分`);
      return stringValue;
    }
    const numberValue = Number(stringValue);
    if (!Number.isSafeInteger(numberValue)) throw new Error(`${field} 的规则值超出范围`);
    return numberValue;
  }
  const stringValue = String(value ?? '').trim();
  if (!stringValue || stringValue.length > 100) throw new Error(`${field} 的规则值不能为空`);
  return stringValue;
}

export function parseUserTagRule(raw: unknown): UserTagRule {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('ruleJson 必须是合法 JSON');
    }
  }
  if (!isRecord(parsed)) throw new Error('用户标签规则必须是 JSON 对象');
  const logic = parsed.logic === 'or' ? 'or' : parsed.logic === 'and' ? 'and' : null;
  if (!logic) throw new Error('用户标签规则 logic 必须是 and 或 or');
  if (!Array.isArray(parsed.conditions) || parsed.conditions.length < 1) {
    throw new Error('用户标签规则至少需要一个条件');
  }
  if (parsed.conditions.length > 20) throw new Error('用户标签规则最多支持 20 个条件');

  const conditions = parsed.conditions.map((item, index) => {
    if (!isRecord(item)) throw new Error(`conditions[${index}] 格式不正确`);
    const field = item.field;
    const operator = item.operator;
    if (!USER_TAG_RULE_FIELDS.includes(field as UserTagRuleField)) {
      throw new Error(`conditions[${index}] field 不受支持`);
    }
    if (typeof operator !== 'string' || !OPERATORS.has(operator as UserTagRuleOperator)) {
      throw new Error(`conditions[${index}] operator 不受支持`);
    }
    const normalizedOperator = operator as UserTagRuleOperator;
    return {
      field: field as UserTagRuleField,
      operator: normalizedOperator,
      ...(NULL_OPERATORS.has(normalizedOperator)
        ? {}
        : { value: normalizedValue(field as UserTagRuleField, item.value) })
    };
  });

  return { logic, conditions };
}

function fieldValue(fact: MemberBehaviorFact, field: UserTagRuleField): string | number | bigint | null {
  switch (field) {
    case 'level':
      return fact.level;
    case 'pointsBalance':
      return fact.pointsBalance;
    case 'paidOrderCount':
      return fact.paidOrderCount;
    case 'paidGmvFen':
      return fact.paidGmvFen;
    case 'daysSinceLastPaid':
      return fact.daysSinceLastPaid;
  }
}

function compare(
  actual: string | number | bigint,
  expected: string | number,
  operator: UserTagRuleOperator
): boolean {
  if (typeof actual === 'string') {
    const left = actual;
    const right = String(expected);
    if (operator === 'contains') return left.includes(right);
    if (operator === 'not_contains') return !left.includes(right);
    if (operator === 'eq') return left === right;
    if (operator === 'neq') return left !== right;
    return false;
  }
  const left = typeof actual === 'bigint' ? actual : BigInt(Math.trunc(actual));
  const right = BigInt(String(expected));
  if (operator === 'eq') return left === right;
  if (operator === 'neq') return left !== right;
  if (operator === 'gt') return left > right;
  if (operator === 'gte') return left >= right;
  if (operator === 'lt') return left < right;
  if (operator === 'lte') return left <= right;
  return false;
}

function matchesCondition(fact: MemberBehaviorFact, condition: UserTagRuleCondition): boolean {
  const actual = fieldValue(fact, condition.field);
  if (condition.operator === 'is_null') return actual === null || actual === '';
  if (condition.operator === 'is_not_null') return actual !== null && actual !== '';
  if (actual === null || actual === '') return false;
  return compare(actual, condition.value ?? '', condition.operator);
}

export function matchesUserTagRule(fact: MemberBehaviorFact, rule: UserTagRule): boolean {
  const results = rule.conditions.map((condition) => matchesCondition(fact, condition));
  return rule.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

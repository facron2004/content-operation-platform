export type AudienceRuleLogic = 'and' | 'or';

export interface AudienceTagRule {
  tags: string[];
  logic: AudienceRuleLogic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseAudienceTagRule(raw: unknown): AudienceTagRule {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('ruleJson 必须是合法 JSON');
    }
  }
  if (!isRecord(parsed)) throw new Error('人群规则必须是 JSON 对象');

  const unsupportedFields = Object.keys(parsed).filter(
    (field) => field !== 'tags' && field !== 'logic'
  );
  if (unsupportedFields.length) {
    throw new Error(`人群规则暂不支持字段：${unsupportedFields.join('、')}`);
  }
  if (!Array.isArray(parsed.tags)) throw new Error('人群规则 tags 必须是数组');
  if (parsed.tags.length > 20) throw new Error('人群规则最多支持 20 个标签');

  const tags = parsed.tags.map((value, index) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
      throw new Error(`tags[${index}] 必须是有效的标签 ID 或编码`);
    }
    return value.trim();
  });
  const logic = parsed.logic === undefined ? 'and' : parsed.logic;
  if (logic !== 'and' && logic !== 'or') throw new Error('人群规则 logic 必须是 and 或 or');

  return { tags: [...new Set(tags)], logic };
}

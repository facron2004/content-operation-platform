import { describeError, randomShortId } from '@content/shared';
import client from './http-client';

export interface OperationRecord {
  id: string;
  timestamp: number;
  type:
    | 'alert_resolve'
    | 'alert_batch_resolve'
    | 'copy_generate'
    | 'copy_audit'
    | 'config_update'
    | 'task_create'
    | 'task_publish'
    | 'task_fail'
    | 'campaign_create';
  action: string;
  details: Record<string, unknown>;
  result: 'success' | 'error';
  error?: string;
}

const OPERATION_TYPE_LABELS: Record<OperationRecord['type'], string> = {
  alert_resolve: '处理预警',
  alert_batch_resolve: '批量处理',
  copy_generate: '生成文案',
  copy_audit: '审核文案',
  config_update: '更新配置',
  task_create: '创建任务',
  task_publish: '确认发布',
  task_fail: '标记失败',
  campaign_create: '创建活动'
};

const OPERATION_HISTORY_STORAGE_KEY = 'operation_history';
const OPERATION_HISTORY_MAX_RECORDS = 100;

function loadOperationHistory(): OperationRecord[] {
  try {
    const stored = localStorage.getItem(OPERATION_HISTORY_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as OperationRecord[];
  } catch (error) {
    console.error('Failed to load operation history:', describeError(error));
  }
  return [];
}

function saveOperationHistory(records: OperationRecord[]): void {
  try {
    localStorage.setItem(OPERATION_HISTORY_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('Failed to save operation history:', describeError(error));
  }
}

function getOperationTypeLabel(type: OperationRecord['type']): string {
  return OPERATION_TYPE_LABELS[type] || type;
}

function exportOperationHistoryCsv(records: OperationRecord[]): string {
  const headers = ['时间', '类型', '操作', '结果', '详情'];
  const rows = records.map((r) => [
    new Date(r.timestamp).toLocaleString('zh-CN'),
    getOperationTypeLabel(r.type),
    r.action,
    r.result === 'success' ? '成功' : '失败',
    JSON.stringify(r.details)
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
    '\n'
  );
}

function queryOperationRecords(records: OperationRecord[]) {
  return {
    getAll: () => [...records],
    getByType: (type: OperationRecord['type']) => records.filter((r) => r.type === type),
    getByTimeRange: (start: number, end: number) =>
      records.filter((r) => r.timestamp >= start && r.timestamp <= end),
    getRecent: (count: number) => records.slice(0, count)
  };
}

export class OperationHistoryService {
  private records: OperationRecord[] = [];
  constructor() {
    this.records = loadOperationHistory();
  }
  add(record: Omit<OperationRecord, 'id' | 'timestamp'>): void {
    const entry: OperationRecord = {
      ...record,
      id: `${Date.now()}_${randomShortId()}`,
      timestamp: Date.now()
    };
    this.records.unshift(entry);
    if (this.records.length > OPERATION_HISTORY_MAX_RECORDS)
      this.records = this.records.slice(0, OPERATION_HISTORY_MAX_RECORDS);
    saveOperationHistory(this.records);

    // Also record to server audit API (non-blocking, silent fail)
    this.recordToServer(entry).catch(() => {
      /* server audit unavailable */
    });
  }

  private async recordToServer(record: OperationRecord): Promise<void> {
    try {
      await client.post('/api/audit-logs', {
        action: record.action,
        objectType: record.type,
        details: JSON.stringify(record.details),
        result: record.result,
        failReason: record.error
      });
    } catch {
      // Server audit API may not be available yet — silently ignore
    }
  }
  getAll() {
    return queryOperationRecords(this.records).getAll();
  }
  getByType(type: OperationRecord['type']) {
    return queryOperationRecords(this.records).getByType(type);
  }
  getByTimeRange(s: number, e: number) {
    return queryOperationRecords(this.records).getByTimeRange(s, e);
  }
  getRecent(count: number) {
    return queryOperationRecords(this.records).getRecent(count);
  }
  clear(): void {
    this.records = [];
    saveOperationHistory(this.records);
  }
  exportToCSV(): string {
    return exportOperationHistoryCsv(this.records);
  }
  getTypeLabel(type: OperationRecord['type']): string {
    return getOperationTypeLabel(type);
  }
}

export const operationHistory = new OperationHistoryService();

export function useOperationHistory() {
  function recordOperation(
    type: OperationRecord['type'],
    action: string,
    details: Record<string, unknown> = {},
    result: 'success' | 'error' = 'success',
    error?: string
  ) {
    operationHistory.add({ type, action, details, result, error });
  }
  function recordSuccess(
    type: OperationRecord['type'],
    action: string,
    details: Record<string, unknown> = {}
  ) {
    recordOperation(type, action, details, 'success');
  }
  function recordError(
    type: OperationRecord['type'],
    action: string,
    error: string,
    details: Record<string, unknown> = {}
  ) {
    recordOperation(type, action, details, 'error', error);
  }
  return {
    recordOperation,
    recordSuccess,
    recordError,
    getAll: () => operationHistory.getAll(),
    getRecent: (count: number) => operationHistory.getRecent(count),
    clear: () => operationHistory.clear(),
    exportToCSV: () => operationHistory.exportToCSV()
  };
}

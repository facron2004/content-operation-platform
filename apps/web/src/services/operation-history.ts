import { randomShortId } from '@content/shared';

export interface OperationRecord {
  id: string;
  timestamp: number;
  type: 'alert_resolve' | 'alert_batch_resolve' | 'copy_generate' | 'copy_audit' | 'config_update';
  action: string;
  details: Record<string, unknown>;
  result: 'success' | 'error';
  error?: string;
}

const STORAGE_KEY = 'operation_history';
const MAX_RECORDS = 100;

class OperationHistoryService {
  private records: OperationRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // 添加操作记录
  add(record: Omit<OperationRecord, 'id' | 'timestamp'>): void {
    const newRecord: OperationRecord = {
      ...record,
      id: `${Date.now()}_${randomShortId()}`,
      timestamp: Date.now()
    };

    this.records.unshift(newRecord);

    // 限制最大记录数
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(0, MAX_RECORDS);
    }

    this.saveToStorage();
  }

  // 获取所有记录
  getAll(): OperationRecord[] {
    return [...this.records];
  }

  // 按类型筛选
  getByType(type: OperationRecord['type']): OperationRecord[] {
    return this.records.filter((r) => r.type === type);
  }

  // 按时间范围筛选
  getByTimeRange(start: number, end: number): OperationRecord[] {
    return this.records.filter((r) => r.timestamp >= start && r.timestamp <= end);
  }

  // 获取最近 N 条
  getRecent(count: number): OperationRecord[] {
    return this.records.slice(0, count);
  }

  // 清空所有记录
  clear(): void {
    this.records = [];
    this.saveToStorage();
  }

  // 导出为 CSV
  exportToCSV(): string {
    const headers = ['时间', '类型', '操作', '结果', '详情'];
    const rows = this.records.map((r) => [
      new Date(r.timestamp).toLocaleString('zh-CN'),
      this.getTypeLabel(r.type),
      r.action,
      r.result === 'success' ? '成功' : '失败',
      JSON.stringify(r.details)
    ]);

    return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
      '\n'
    );
  }

  // 从 localStorage 加载
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.records = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load operation history:', error);
      this.records = [];
    }
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (error) {
      console.error('Failed to save operation history:', error);
    }
  }

  // 获取类型标签
  private getTypeLabel(type: OperationRecord['type']): string {
    const labels: Record<OperationRecord['type'], string> = {
      alert_resolve: '处理预警',
      alert_batch_resolve: '批量处理预警',
      copy_generate: '生成文案',
      copy_audit: '审核文案',
      config_update: '更新配置'
    };
    return labels[type] || type;
  }
}

// 单例
export const operationHistory = new OperationHistoryService();

// Vue composable
export function useOperationHistory() {
  // 记录操作
  function recordOperation(
    type: OperationRecord['type'],
    action: string,
    details: Record<string, unknown> = {},
    result: 'success' | 'error' = 'success',
    error?: string
  ) {
    operationHistory.add({ type, action, details, result, error });
  }

  // 记录成功操作
  function recordSuccess(
    type: OperationRecord['type'],
    action: string,
    details: Record<string, unknown> = {}
  ) {
    recordOperation(type, action, details, 'success');
  }

  // 记录失败操作
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

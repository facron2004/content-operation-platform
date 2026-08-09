import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  error: vi.fn(),
  exportToCSV: vi.fn(),
  getAll: vi.fn(),
  success: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.error,
    success: mocks.success
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}));

vi.mock('../services/operation-history', () => ({
  operationHistory: {
    getTypeLabel: (type: string) => type
  },
  useOperationHistory: () => ({
    clear: vi.fn(),
    exportToCSV: mocks.exportToCSV,
    getAll: mocks.getAll
  })
}));

import { exportOperationHistoryCsv, useOperationHistoryDialog } from './useOperationHistoryDialog';

describe('useOperationHistoryDialog export lifecycle', () => {
  beforeEach(() => {
    mocks.confirm.mockReset();
    mocks.error.mockReset();
    mocks.exportToCSV.mockReset().mockReturnValue('"header"');
    mocks.getAll.mockReset().mockReturnValue([]);
    mocks.success.mockReset();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ click: vi.fn() }))
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:operation-history')
    });
  });

  it('reports export failures to the owning dialog', () => {
    const onError = vi.fn();

    exportOperationHistoryCsv(() => {
      throw new Error('export unavailable');
    }, onError);

    expect(mocks.error).toHaveBeenCalledWith('导出失败');
    expect(onError).toHaveBeenCalledWith('导出失败');
  });

  it('keeps export failure visible until a retry succeeds', () => {
    mocks.exportToCSV
      .mockImplementationOnce(() => {
        throw new Error('export unavailable');
      })
      .mockReturnValueOnce('"header"');
    const dialog = useOperationHistoryDialog();

    dialog.exportCSV();
    expect(dialog.exportError.value).toBe('导出失败');

    dialog.exportCSV();
    expect(dialog.exportError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('导出成功');
  });
});

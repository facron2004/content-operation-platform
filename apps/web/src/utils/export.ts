import type * as XLSXType from 'xlsx';

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
  format?: 'xlsx' | 'csv';
}

/** 清理单元格内容防止 CSV 注入（= + - @ 开头的公式） */
function sanitizeCell(value: unknown): unknown {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function sanitizeData(data: Record<string, unknown>[]): Record<string, unknown>[] {
  return data.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCell(value);
    }
    return sanitized;
  });
}

// 导出表格数据为 Excel（动态加载 xlsx 库，减少初始包体积约 400KB）
export async function exportToExcel(
  data: Record<string, unknown>[],
  options: ExportOptions = {}
) {
  const {
    filename = `导出数据_${new Date().toISOString().slice(0, 10)}`,
    sheetName = 'Sheet1',
    format = 'xlsx'
  } = options;

  try {
    const XLSX: typeof XLSXType = await import('xlsx');
    const sanitizedData = sanitizeData(data);

    // 创建工作簿
    const wb = XLSX.utils.book_new();

    // 创建工作表
    const ws = XLSX.utils.json_to_sheet(sanitizedData);

    // 自动列宽
    const maxWidth = 50;
    const colWidths = Object.keys(data[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => String(row[key] || '').length)
      );
      return { wch: Math.min(maxLen + 2, maxWidth) };
    });
    ws['!cols'] = colWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // 导出文件
    XLSX.writeFile(wb, `${filename}.${format}`);

    return { success: true };
  } catch (error) {
    console.error('Export failed:', error);
    return { success: false, error };
  }
}

// 导出为 CSV
export function exportToCSV(data: Record<string, unknown>[], filename?: string) {
  return exportToExcel(data, { filename, format: 'csv' });
}

// 导出当前视图数据
export function exportTableData(
  tableData: Record<string, unknown>[],
  columns: Array<{ prop: string; label: string }>,
  filename?: string
) {
  const exportData = tableData.map((row) => {
    const item: Record<string, unknown> = {};
    columns.forEach((col) => {
      item[col.label] = row[col.prop];
    });
    return item;
  });

  return exportToExcel(exportData, { filename });
}

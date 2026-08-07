import ExcelJS from 'exceljs';

export const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF3B82F6' }
};
export const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
  name: 'Microsoft YaHei'
};
export const TITLE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 14,
  color: { argb: 'FF1F2937' },
  name: 'Microsoft YaHei'
};
const LABEL_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  color: { argb: 'FF6B7280' },
  name: 'Microsoft YaHei'
};
const VALUE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 15,
  color: { argb: 'FF111827' },
  name: 'Microsoft YaHei'
};
export const BODY_FONT: Partial<ExcelJS.Font> = { name: 'Microsoft YaHei', size: 11 };
const MONEY_FMT = '¥#,##0.00';
const RATE_FMT = '0.00%';
const INT_FMT = '#,##0';
const NUM_FMT = '#,##0.00';

export function applyHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

export function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.columns = widths.map((width) => ({ width }));
}

export function moneyCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = MONEY_FMT;
  cell.font = BODY_FONT;
}

export function rateCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = RATE_FMT;
  cell.font = BODY_FONT;
}

export function intCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = INT_FMT;
  cell.font = BODY_FONT;
}

export function numCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = NUM_FMT;
  cell.font = BODY_FONT;
}

/**
 * Neutralize Excel/Sheets formula injection on free-form JeSite strings.
 * Leading `= + - @` (or tab/CR) get a leading `'` so spreadsheet apps treat
 * the value as text — same rule as csvEscape.
 */
function excelSafeText(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function textCell(cell: ExcelJS.Cell, value: string | number) {
  cell.value = typeof value === 'string' ? excelSafeText(value) : value;
  // Force text format so poisoned orderIds / merchant names cannot re-activate as formulas.
  if (typeof value === 'string') cell.numFmt = '@';
  cell.font = BODY_FONT;
}

export function kpiBlock(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  label: string,
  value: number | string,
  fmt: 'money' | 'rate' | 'int' | 'text' | 'num' = 'text'
) {
  const labelCell = sheet.getCell(row, col);
  labelCell.value = label;
  labelCell.font = LABEL_FONT;
  const valueCell = sheet.getCell(row + 1, col);
  if (typeof value === 'string') {
    textCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'money') {
    moneyCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'rate') {
    rateCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'int') {
    intCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else if (fmt === 'num') {
    numCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  } else {
    textCell(valueCell, value);
    valueCell.font = VALUE_FONT;
  }
}

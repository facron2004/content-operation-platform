/**
 * Escape a CSV cell and neutralize Excel/Sheets formula injection.
 * Leading `= + - @` (or tab/CR) get a leading `'` so spreadsheet apps treat
 * the value as text instead of executing it.
 */
export function csvEscape(value: string | null | undefined): string {
  if (value == null) return '';
  // Neutralize Excel/Sheets formula injection on leading = + - @ or tab/CR.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Alias used by merchant-sales export path. */
export const csvCell = csvEscape;

// Standalone formatter shim.
//
// In the main workbench these helpers live in fmrModel.js alongside the
// farm-to-market-road model. The NIA closure only needs the pure formatting
// helpers, so this shim carries exactly those — implementations match the
// main workbench byte-for-byte, and pctChange/signedPct delegate to the
// shared pctChange.js copied alongside.
import {pctChange, signedPct} from './pctChange.js';
export {pctChange, signedPct};

export const money = value => value == null ? '—' : `₱${value.toLocaleString('en-PH')}`;
export const compactMoney = value => value == null ? '—' : Math.abs(value) >= 1e9 ? `₱${(value / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 4})}B` : Math.abs(value) >= 1e6 ? `₱${(value / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M` : money(value);
export const signedMoney = value => value == null ? '—' : `${value > 0 ? '+' : ''}${money(value)}`;

// Same comparator contract as SortableTable so route-backed cards and the
// table itself always agree on order: missing values sink, numbers compare
// numerically, everything else compares with numeric-aware localeCompare.
export function sortRows(rows, getValue, sort) {
  if (!sort?.key) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = getValue(a), y = getValue(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), 'en', {numeric: true, sensitivity: 'base'}) * factor;
  });
}

export function csvText(headers, rows) {
  // Protect spreadsheet users from formulas in extracted titles or text fields.
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

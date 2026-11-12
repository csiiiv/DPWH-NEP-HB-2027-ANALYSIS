/**
 * Simple/Full × CSV/JSON downloads for NIA title-chainage ₱/m tables.
 * Feeds the shared ExportModal chooser used by the Congress explorer.
 */
import {csvText} from './niaModel.js';

const SUMMARY_SIMPLE = [
  ['label', 'Group'],
  ['projects', 'Source rows'],
  ['with_chainage', 'With chainage'],
  ['chainage_share', 'Chainage share'],
  ['median', 'Median PHP per m'],
  ['p25', 'P25 PHP per m'],
  ['p75', 'P75 PHP per m'],
  ['max', 'Max PHP per m'],
];

const SUMMARY_FULL = [
  ...SUMMARY_SIMPLE,
  ['mean', 'Mean PHP per m'],
  ['min', 'Min PHP per m'],
  ['id', 'Group id'],
];

const PROJECT_SIMPLE = [
  ['display_title', 'Title (fixed / submission)'],
  ['funding_label', 'Funding'],
  ['chainage_spans', 'Chainages'],
  ['chainage_length_m', 'Length m'],
  ['php_per_m', 'PHP per m'],
  ['amount_php', 'Allocation PHP'],
  ['location_basis', 'Map basis'],
];

const PROJECT_FULL = [
  ['id', 'Source id'],
  ['senate_id', 'Senate workbook id'],
  ['display_title', 'Title (fixed / submission)'],
  ['submission_label', 'Submission label (col V)'],
  ['ledger_title', 'Annex print title'],
  ['funding_label', 'Funding'],
  ['funding_scope', 'Funding scope key'],
  ['workbook_status', 'Workbook status'],
  ['category', 'Category'],
  ['region', 'Region'],
  ['province', 'Province'],
  ['subprogram_key', 'Sub-program'],
  ['program_group', 'Program'],
  ['chainage_spans', 'Chainages'],
  ['chainage_length_m', 'Length m'],
  ['php_per_m', 'PHP per m'],
  ['amount_php', 'Allocation PHP'],
  ['has_location', 'Has map location'],
  ['location_basis', 'Map basis'],
  ['source_pdf', 'Source PDF'],
  ['pdf_page', 'PDF page'],
  ['printed_page', 'Printed page'],
];

const OUTLIER_SIMPLE = [
  ['title', 'Title (fixed / submission)'],
  ['group_label', 'Group'],
  ['funding_label', 'Funding'],
  ['side', 'Side'],
  ['severity', 'Severity'],
  ['fence_score', 'Fence score (IQR)'],
  ['median_ratio', '× group median'],
  ['php_per_m', 'PHP per m'],
  ['whisker_low', 'Group whisker low'],
  ['whisker_high', 'Group whisker high'],
  ['chainage_length_m', 'Length m'],
  ['amount_php', 'Allocation PHP'],
];

const OUTLIER_FULL = [
  ['id', 'Source id'],
  ['senate_id', 'Senate workbook id'],
  ['title', 'Title (fixed / submission)'],
  ['submission_label', 'Submission label (col V)'],
  ['ledger_title', 'Annex print title'],
  ['group_id', 'Group id'],
  ['group_label', 'Group'],
  ['funding_label', 'Funding'],
  ['funding_scope', 'Funding scope key'],
  ['workbook_status', 'Workbook status'],
  ['side', 'Side'],
  ['severity', 'Severity'],
  ['fence_score', 'Fence score (IQR)'],
  ['median_ratio', '× group median'],
  ['php_per_m', 'PHP per m'],
  ['median', 'Group median PHP per m'],
  ['p25', 'Group P25 PHP per m'],
  ['p75', 'Group P75 PHP per m'],
  ['iqr', 'Group IQR PHP per m'],
  ['whisker_low', 'Group whisker low'],
  ['whisker_high', 'Group whisker high'],
  ['chainage_length_m', 'Length m'],
  ['amount_php', 'Allocation PHP'],
  ['category', 'Category'],
  ['region', 'Region'],
  ['subprogram_key', 'Sub-program'],
  ['program_group', 'Program'],
  ['source_pdf', 'Source PDF'],
  ['pdf_page', 'PDF page'],
  ['printed_page', 'Printed page'],
];

function columnsFor(kind, scope) {
  if (kind === 'summary') return scope === 'simple' ? SUMMARY_SIMPLE : SUMMARY_FULL;
  if (kind === 'outliers') return scope === 'simple' ? OUTLIER_SIMPLE : OUTLIER_FULL;
  return scope === 'simple' ? PROJECT_SIMPLE : PROJECT_FULL;
}

function cell(row, key) {
  if (key === 'source_pdf') return row.source?.source_pdf ?? '';
  if (key === 'pdf_page') return row.source?.pdf_page ?? '';
  if (key === 'printed_page') return row.source?.printed_page ?? '';
  if (key === 'display_title') {
    return row.display_title || row.submission_label || row.title || '';
  }
  if (key === 'ledger_title') return row.ledger_title || row.title || '';
  if (key === 'chainage_share') {
    return row.chainage_share == null ? '' : Number(row.chainage_share);
  }
  if (key === 'has_location') return row.has_location ? 'yes' : 'no';
  const value = row[key];
  return value == null ? '' : value;
}

function slug(value, max = 40) {
  return String(value ?? '').trim()
    .replace(/[^a-zA-Z0-9_\s:\-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, max) || 'nia';
}

export function chainageExportFileName(meta, format) {
  const kind = meta?.kind === 'summary' ? 'chainage-summary'
    : meta?.kind === 'outliers' ? 'chainage-outliers'
    : 'chainage-projects';
  const scope = meta?.scope === 'simple' ? 'simple' : 'full';
  const dim = slug(meta?.dim, 20);
  const stage = slug(meta?.stage, 12);
  const group = meta?.group ? slug(meta.group, 36) : null;
  return ['nia', kind, stage, dim, group, scope].filter(Boolean).join('_') + `.${format}`;
}

export function exportChainageCsv(rows, meta) {
  const columns = columnsFor(meta?.kind, meta?.scope);
  return csvText(
    columns.map(([, label]) => label),
    rows.map(row => columns.map(([key]) => cell(row, key))),
  );
}

export function exportChainageJson(rows, meta) {
  const columns = columnsFor(meta?.kind, meta?.scope);
  const isSimple = meta?.scope === 'simple';
  const kind = meta?.kind === 'summary' ? 'summary'
    : meta?.kind === 'outliers' ? 'outliers'
    : 'projects';
  return JSON.stringify({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    amount_unit: 'PHP',
    rate_unit: 'PHP_per_m',
    kind,
    scope: isSimple ? 'simple' : 'full',
    stage: meta?.stage ?? null,
    dim: meta?.dim ?? null,
    group: meta?.group ?? null,
    row_count: rows.length,
    columns: Object.fromEntries(columns),
    note: meta?.note ?? null,
    rows: rows.map(row => {
      const out = {};
      for (const [key] of columns) {
        if (key === 'source_pdf' || key === 'pdf_page' || key === 'printed_page') continue;
        if (key === 'display_title') {
          out[key] = row.display_title || row.submission_label || row.title || null;
        } else if (key === 'ledger_title') {
          out[key] = row.ledger_title || row.title || null;
        } else {
          out[key] = row[key] ?? null;
        }
      }
      if ((kind === 'projects' || kind === 'outliers') && !isSimple) {
        out.source = row.source ? {
          source_pdf: row.source.source_pdf ?? null,
          pdf_page: row.source.pdf_page ?? null,
          printed_page: row.source.printed_page ?? null,
        } : null;
      }
      return out;
    }),
  }, null, 2);
}

/** Trigger browser download for chainage summary or explore rows. */
export function downloadChainageExport(rows, meta, format) {
  const body = format === 'json'
    ? exportChainageJson(rows, meta)
    : exportChainageCsv(rows, meta);
  const type = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
  const url = URL.createObjectURL(new Blob([body], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = chainageExportFileName(meta, format);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

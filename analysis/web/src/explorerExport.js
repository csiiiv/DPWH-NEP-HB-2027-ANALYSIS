/**
 * Export the Congress project explorer's rows as CSV or JSON.
 *
 * The explorer (CongressApp District view) renders rows shaped by
 * explorerRow()/fmrExplorerRow(); this module turns those view rows into a
 * flat download. Columns mirror the explorer's visible columns so a CSV opens
 * in any spreadsheet with the same vocabulary as the screen. Nested record
 * views (house/nep/api) are flattened into source-id/page columns, never
 * serialized as blobs.
 */
import {EXPLORER_COLUMNS} from './congressModel.js';

const CSV_COLUMNS = [
  ['id', 'ID'],
  ['title', 'Title'],
  ['bucket', 'Bucket'],
  ['statusLabel', 'Match status'],
  ['flagLabels', 'Analytic flags'],
  ['psgc_location', 'Title PSGC location'],
  ['assignment', 'Assignment basis'],
  ['region', 'Region'],
  ['program', 'Program'],
  ['pap', 'PAP'],
  ['house_office', 'HGAB3 office'],
  ['nep_office', 'NEP office'],
  ['house_php', 'HGAB3 PHP'],
  ['nep_php', 'NEP PHP'],
  ['delta_php', 'HGAB3 minus NEP PHP'],
  ['house_source_id', 'HGAB3 source records'],
  ['house_source_pdf', 'HGAB3 source PDF'],
  ['house_pdf_page', 'HGAB3 PDF pages'],
  ['nep_source_id', 'NEP source records'],
  ['nep_source_pdf', 'NEP source PDF'],
  ['nep_pdf_page', 'NEP PDF pages'],
  ['reading_status', 'House reading status'],
  ['match_basis', 'Match basis'],
  ['confidence', 'Confidence'],
  ['trace', 'Trace'],
  ['chainage', 'Chainage'],
  ['coordinates', 'Coordinates'],
  ['scope_review', 'Scope review'],
];

function stringValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Assignment/location evidence is a structured object; render its human label.
function assignmentLabel(row) {
  const view = row.assignment;
  if (!view) return '';
  if (typeof view === 'string') return view;
  if (view.label) return view.label;
  return JSON.stringify(view);
}

function cell(row, key) {
  if (key === 'assignment') return assignmentLabel(row);
  const value = row[key];
  if (key === 'flagLabels') return (row.flagLabels ?? []).join('; ');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Record views (house/nep) keep their ids; anything else stringifies.
    return JSON.stringify(value);
  }
  return stringValue(value);
}

function evidence(row, side) {
  const record = row[side];
  if (!record) return ['', '', ''];
  const members = record.records?.length ? record.records : [record];
  const ids = members.map(r => r.source_record_id ?? r.id).filter(Boolean).join('; ');
  const pdf = record.source_pdf ?? record.pdf ?? '';
  const pages = [...new Set(members.flatMap(r =>
    r.pdf_pages ?? (r.pdf_page != null ? [r.pdf_page] : [])))].join('; ');
  return [ids, pdf, pages];
}

/** Serialize filtered explorer rows to CSV (CRLF, formula-injection safe). */
export function exportExplorerCsv(rows, meta) {
  const escape = value => {
    const s = String(value ?? '');
    const guarded = /^[=+@-]/.test(s) ? "'" + s : s;
    return '"' + guarded.replaceAll('"', '""') + '"';
  };
  const headings = CSV_COLUMNS.map(([, label]) => label);
  const lines = [headings];
  for (const row of rows) {
    const [hid, hpdf, hpages] = evidence(row, 'house');
    const [nid, npdf, npages] = evidence(row, 'nep');
    const record = {
      ...row,
      house_source_id: hid, house_source_pdf: hpdf, house_pdf_page: hpages,
      nep_source_id: nid, nep_source_pdf: npdf, nep_pdf_page: npages,
    };
    lines.push(CSV_COLUMNS.map(([key]) => escape(cell(record, key))));
  }
  const csv = lines.map(line => line.join(',')).join('\r\n');
  // Byte-order mark keeps Excel from mojibake-ing the peso amounts as UTF-8.
  return '\ufeff' + csv;
}

/** Serialize filtered explorer rows to JSON with provenance metadata. */
export function exportExplorerJson(rows, meta) {
  return JSON.stringify({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    amount_unit: 'PHP',
    count_unit: 'explorer_rows',
    lens: meta?.lens ?? null,
    card: meta?.card ?? null,
    filters: meta?.filters ?? {},
    row_count: rows.length,
    columns: Object.fromEntries(CSV_COLUMNS),
    rows: rows.map(row => {
      const [hid, hpdf, hpages] = evidence(row, 'house');
      const [nid, npdf, npages] = evidence(row, 'nep');
      const out = {};
      for (const [key] of CSV_COLUMNS) {
        if (key === 'assignment') out[key] = assignmentLabel(row) || null;
        else if (key === 'flagLabels') out.flags = row.flagLabels ?? [];
        else if (['house_source_id', 'house_source_pdf', 'house_pdf_page',
          'nep_source_id', 'nep_source_pdf', 'nep_pdf_page'].includes(key)) continue;
        else if (key in row) out[key] = row[key] ?? null;
      }
      out.evidence = {
        house: {source_ids: hid || null, pdf: hpdf || null, pages: hpages || null},
        nep: {source_ids: nid || null, pdf: npdf || null, pages: npages || null},
      };
      return out;
    }),
  }, null, 2);
}

/** Filesystem-safe download name describing the card and active filters. */
export function explorerExportFileName(meta, format) {
  const slug = (value, max = 40) => String(value ?? '').trim()
    .replace(/[^a-zA-Z0-9_\s:\-]/g, '').replace(/\s+/g, '-').slice(0, max);
  const lens = meta?.lens ?? 'congress';
  const card = slug(meta?.card ?? 'all');
  const filters = Object.entries(meta?.filters ?? {})
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}-${slug(value, 20)}`);
  const parts = [lens, card, ...filters].filter(Boolean);
  return `${parts.join('_')}.${format}`;
}

/** Trigger the browser download for the given format. */
export function downloadExplorer(rows, meta, format) {
  const body = format === 'json'
    ? exportExplorerJson(rows, meta)
    : exportExplorerCsv(rows, meta);
  const type = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
  const url = URL.createObjectURL(new Blob([body], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = explorerExportFileName(meta, format);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

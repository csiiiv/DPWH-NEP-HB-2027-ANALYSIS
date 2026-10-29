/**
 * Export the Congress project explorer's rows as CSV or JSON, in either a
 * Simple (core fields) or Full (everything) schema.
 *
 * The explorer (CongressApp District view) renders rows shaped by
 * explorerRow()/fmrExplorerRow(); this module turns those view rows into a
 * flat download. Columns mirror the explorer's visible columns so a CSV opens
 * in any spreadsheet with the same vocabulary as the screen. Nested record
 * views (house/nep/api) are flattened into source-id/page columns, never
 * serialized as blobs.
 *
 * Source citations are split by ledger side (HGAB3 vs NEP) and rendered as
 * page-anchored links (`…#page=N`), the same fragment the in-app PDF preview
 * and `pdfSourceFromUrl()` already honor — so a cell in Excel or a string in
 * JSON opens the exact page it cites.
 */
import {publishedSourceLink} from './data.js';

const SIMPLE_COLUMNS = [
  ['title', 'Project Title'],
  ['bucket', 'Bucket'],
  ['statusLabel', 'Match Status'],
  ['flagLabels', 'Analytic Flags'],
  ['region', 'Region'],
  ['program', 'Program'],
  ['nep_office', 'NEP Office'],
  ['house_office', 'HGAB3 Office'],
  ['house_php', 'HGAB3 Value'],
  ['nep_php', 'NEP Value'],
  ['delta_php', 'DELTA PESO'],
  ['house_source_link', 'HGAB3 Source Page'],
  ['nep_source_link', 'NEP Source Page'],
];

const FULL_COLUMNS = [
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
  ['house_source_link', 'HGAB3 source links'],
  ['nep_source_id', 'NEP source records'],
  ['nep_source_pdf', 'NEP source PDF'],
  ['nep_pdf_page', 'NEP PDF pages'],
  ['nep_source_link', 'NEP source links'],
  ['reading_status', 'House reading status'],
  ['match_basis', 'Match basis'],
  ['confidence', 'Confidence'],
  ['trace', 'Trace'],
  ['chainage', 'Chainage'],
  ['coordinates', 'Coordinates'],
  ['scope_review', 'Scope review'],
];

/** Column set for the requested scope; defaults to full. */
function columnsFor(meta) {
  return meta?.scope === 'simple' ? SIMPLE_COLUMNS : FULL_COLUMNS;
}

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

// Which ledger side a page reference belongs to. Kinds differ by lens: the
// DPWH/location explorers cite 'house-third'/'nep', the FMR explorer replaces
// them with 'fmr-house'/'fmr-nep' (different physical volumes), and the
// Transparency API corroborates identity but prints no page. Classifying by
// side rather than by exact kind keeps one code path correct for every lens.
const SIDE_OF_KIND = {
  'house': 'house', 'house-second': 'house', 'house-third': 'house',
  'house-third-controls': 'house', 'fmr-house': 'house',
  'nep': 'nep', 'fmr-nep': 'nep',
  'api': 'api',
};

function sideOfKind(kind) {
  if (SIDE_OF_KIND[kind]) return SIDE_OF_KIND[kind];
  if (typeof kind !== 'string') return null;
  if (kind.startsWith('fmr-nep') || kind.startsWith('nep')) return 'nep';
  if (kind.startsWith('fmr-house') || kind.startsWith('house')) return 'house';
  return null;
}

/** Page references belonging to one ledger side, in citation order. */
function sideRefs(row, side) {
  return (Array.isArray(row.pdf) ? row.pdf : [])
    // Page must be a real PDF page: upstream pdfView() already rejects 0 and
    // negatives, but the FMR lens builds its own refs, so re-check here rather
    // than cite a page that cannot exist.
    .filter(ref => sideOfKind(ref?.kind) === side &&
      Number.isInteger(ref.page) && ref.page >= 1);
}

// Each side's page references become page-anchored links into the published
// site, one per line, e.g. "https://csiiiv.github.io/…/VOL I-C .pdf#page=201".
// The fragment is the same one the in-app preview and pdfSourceFromUrl()
// already parse, and Excel/Sheets auto-link a cell holding a bare URL — so no
// formula is emitted, which keeps the injection guard in exportExplorerCsv()
// honest. Links are rooted at the Pages origin, never the dev server: a
// download gets opened long after `npm run dev` has stopped.
function pageLink(ref) {
  return publishedSourceLink(ref.kind, ref.page);
}

/** One line per cited page: the link when resolvable, else the page number. */
function sideSourceLinks(row, side) {
  return sideRefs(row, side)
    .map(ref => pageLink(ref) ?? `p. ${ref.page}`)
    .join('\n');
}

/** Bare page numbers plus any resolvable page-anchored links for one side. */
function sideCitation(row, side) {
  const refs = sideRefs(row, side);
  if (!refs.length) return {pages: null, links: null};
  const links = refs.map(pageLink).filter(Boolean);
  return {
    pages: refs.map(ref => ref.page),
    links: links.length ? links : null,
  };
}

function cell(row, key) {
  if (key === 'assignment') return assignmentLabel(row);
  if (key === 'house_source_link') return sideSourceLinks(row, 'house');
  if (key === 'nep_source_link') return sideSourceLinks(row, 'nep');
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

// Augment a row with the flattened evidence columns the Full schema prints.
function withEvidence(row) {
  const [hid, hpdf, hpages] = evidence(row, 'house');
  const [nid, npdf, npages] = evidence(row, 'nep');
  return {
    ...row,
    house_source_id: hid, house_source_pdf: hpdf, house_pdf_page: hpages,
    nep_source_id: nid, nep_source_pdf: npdf, nep_pdf_page: npages,
  };
}

/** Serialize filtered explorer rows to CSV (CRLF, formula-injection safe). */
export function exportExplorerCsv(rows, meta) {
  const columns = columnsFor(meta);
  const escape = value => {
    const s = String(value ?? '');
    const guarded = /^[=+@-]/.test(s) ? "'" + s : s;
    return '"' + guarded.replaceAll('"', '""') + '"';
  };
  const lines = [columns.map(([, label]) => label).join(',')];
  for (const row of rows) {
    const record = withEvidence(row);
    lines.push(columns.map(([key]) => escape(cell(record, key))).join(','));
  }
  const csv = lines.join('\r\n');
  // Byte-order mark keeps Excel from mojibake-ing the peso amounts as UTF-8.
  return '\ufeff' + csv;
}

/** Serialize filtered explorer rows to JSON with provenance metadata. */
export function exportExplorerJson(rows, meta) {
  const columns = columnsFor(meta);
  const isSimple = columns === SIMPLE_COLUMNS;
  return JSON.stringify({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    amount_unit: 'PHP',
    count_unit: 'explorer_rows',
    scope: isSimple ? 'simple' : 'full',
    lens: meta?.lens ?? null,
    card: meta?.card ?? null,
    filters: meta?.filters ?? {},
    row_count: rows.length,
    columns: Object.fromEntries(columns),
    rows: rows.map(row => {
      const out = {};
      // Keys whose value is emitted under a better-shaped name (or folded into
      // `evidence`/`source_pages`), so they must not be copied verbatim.
      const SKIP = ['house_source_id', 'house_source_pdf', 'house_pdf_page',
        'nep_source_id', 'nep_source_pdf', 'nep_pdf_page',
        'house_source_link', 'nep_source_link'];
      for (const [key] of columns) {
        if (SKIP.includes(key)) continue;
        else if (key === 'assignment') out[key] = assignmentLabel(row) || null;
        else if (key === 'flagLabels') out.flags = row.flagLabels ?? [];
        else if (key in row) out[key] = row[key] ?? null;
      }
      // Split source citation: one entry per ledger side, page numbers plus the
      // page-anchored links when the browser can resolve the document URL. Both
      // scopes carry this, so a JSON consumer never has to re-derive pages from
      // the Full schema's flattened evidence strings.
      out.source_pages = {
        house: sideCitation(row, 'house'),
        nep: sideCitation(row, 'nep'),
      };
      if (!isSimple) {
        const [hid, hpdf, hpages] = evidence(row, 'house');
        const [nid, npdf, npages] = evidence(row, 'nep');
        out.evidence = {
          house: {source_ids: hid || null, pdf: hpdf || null, pages: hpages || null},
          nep: {source_ids: nid || null, pdf: npdf || null, pages: npages || null},
        };
      }
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
  const scope = meta?.scope === 'simple' ? 'simple' : 'full';
  const filters = Object.entries(meta?.filters ?? {})
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}-${slug(value, 20)}`);
  const parts = [lens, card, scope, ...filters].filter(Boolean);
  return `${parts.join('_')}.${format}`;
}

/** Trigger the browser download for the given format and scope. */
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

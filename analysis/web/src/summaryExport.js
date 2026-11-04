// Summary rows are card aggregates, not individual project records.
const SIMPLE = [
  ['name', 'District / City'], ['representative', 'Representative'],
  ['nepCount', 'NEP records'], ['nepAmount', 'NEP'],
  ['houseCount', 'HGAB3 records'], ['houseAmount', 'Amended (HGAB3)'],
  ['delta', 'Increase'],
];
const FULL = [...SIMPLE, ['cardId', 'Card ID'], ['tier', 'Mapping tier'],
  ['region', 'Region'], ['offices', 'Implementing offices'], ['ledgerRows', 'Ledger rows']];

function flatten(row) {
  const card = row.card;
  return {
    ...row,
    cardId: card.id,
    tier: card.location_tier ?? card.tier ?? null,
    region: card.region ?? null,
    offices: card.offices?.length
      ? card.offices.map(office => office.name).filter(Boolean)
      : card.ledger_names ?? [],
    ledgerRows: card.rows,
  };
}

export function serializeSummary(rows, meta, format) {
  const columns = meta.scope === 'full' ? FULL : SIMPLE;
  const records = rows.map(row => {
    const flat = flatten(row);
    return Object.fromEntries(columns.map(([key]) => [key, flat[key] ?? null]));
  });
  const totals = {
    name: 'Total', representative: '', nepCount: meta.totals.nep.count,
    nepAmount: meta.totals.nep.amount_php, houseCount: meta.totals.house.count,
    houseAmount: meta.totals.house.amount_php, delta: meta.totals.delta_php,
    ledgerRows: meta.totals.rows,
  };
  if (format === 'json') return JSON.stringify({
    schema_version: 1, exported_at: new Date().toISOString(),
    scope: meta.scope, lens: meta.lens, filters: meta.filters ?? {},
    sort: meta.sort ?? null, amount_unit: 'PHP', count_unit: 'source_records',
    row_count: records.length, columns: Object.fromEntries(columns),
    rows: records,
    totals: Object.fromEntries(columns.map(([key]) => [key, totals[key] ?? null])),
  }, null, 2);
  const escape = value => {
    const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
    const safe = /^[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [
    columns.map(([, label]) => escape(label)).join(','),
    ...records.map(row => columns.map(([key]) => escape(row[key])).join(',')),
    columns.map(([key]) => escape(totals[key])).join(','),
  ].join('\r\n');
}

export function downloadSummary(rows, meta, format) {
  const body = serializeSummary(rows, meta, format);
  const url = URL.createObjectURL(new Blob([body], {
    type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'congress-summary-' + meta.scope + '.' + format;
  link.click();
  URL.revokeObjectURL(url);
}

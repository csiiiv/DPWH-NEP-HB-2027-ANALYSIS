// NIA geolocation model: aggregations over the AI-assisted location layer.
// Mirrors the workspace's evidence discipline — counts and sums are grouped
// over located rows only; unlocated rows are always shown as a coverage gap.
import {money} from './fmrModel.js';

export const NIA_LOCATION_NOTE = 'Locations come from an AI-assisted enrichment of the comparison '
  + 'ledger ( barangay-level PSGC where resolved, municipality otherwise). Points are polygon '
  + 'centroids — map anchors, not surveyed project sites.';

export const locationFlagLabels = {
  psgc_malformed: 'Malformed PSGC',
  psgc_unknown: 'Unknown PSGC',
  incomplete_names: 'Incomplete place names',
  deo_province_mismatch: 'DEO/province mismatch',
  weak_reference: 'Weak location reference',
  municipality_level_anchor: 'Municipality-level anchor',
};

function push(map, key, row) {
  if (!key) return;
  let entry = map.get(key);
  if (!entry) {entry = {key, count: 0, amount_php: 0, statuses: {paired: 0, house_only: 0, nep_only: 0}}; map.set(key, entry);}
  entry.count += 1;
  entry.amount_php += row.amount ?? 0;
  if (entry.statuses[row.status] != null) entry.statuses[row.status] += 1;
}

/** Aggregate located geolocation rows by province, municipality and district. */
export function niaLocationAggregates(data) {
  const geolocation = data.geolocation;
  if (!geolocation) return null;
  const comparisonById = new Map((data.comparison || []).map(r => [r.id, r]));
  const rows = geolocation.records.map(r => {
    const row = comparisonById.get(r.id);
    return {
      id: r.id,
      located: r.located,
      coordinates: r.coordinates,
      anchor: r.coordinate_anchor,
      flags: r.flags || [],
      barangay: r.barangay, municipality: r.municipality, province: r.province,
      district: r.legislative_district, deo: r.deo,
      status: row?.status || 'unknown',
      amount: row?.house?.amount_php ?? row?.nep?.amount_php ?? null,
      delta_php: row?.delta_php ?? null,
      title: row?.house?.title || row?.nep?.title || r.id,
    };
  });
  const provinces = new Map(), municipalities = new Map(), districts = new Map();
  for (const row of rows) {
    if (!row.located) continue;
    push(provinces, row.province, row);
    push(municipalities, row.province && row.municipality ? `${row.municipality} · ${row.province}` : row.municipality, row);
    push(districts, row.district, row);
  }
  const sortRows = map => [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    rows,
    summary: geolocation.summary,
    provinces: sortRows(provinces),
    municipalities: sortRows(municipalities),
    districts: sortRows(districts),
    unlocatedStatuses: rows.filter(r => !r.located).reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1; return acc;
    }, {}),
    flagged: rows.filter(r => r.flags.length > 0),
  };
}

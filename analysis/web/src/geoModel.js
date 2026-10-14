// Geolocation inventory model: filters, grouping metadata, and GeoJSON overlay
// for the cross-dataset GPS scan (gps-analysis/scan_gps_inventory.py).

export const GROUP_COLORS = {fmr: '#7c3aed', dpwh: '#2563eb', nia: '#0f766e', hfep: '#b45309'};
export const STATUS_OPTIONS = [
  ['parsed', 'Parsed'],
  ['parsed_with_issues', 'Parsed with issues'],
  ['unparsed_candidate', 'Unparsed candidate'],
  ['hint_only', 'Hint only'],
];
export const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
export const FRAGMENT_KIND_OPTIONS = [
  ['dedicated_coordinates_raw', 'Dedicated coordinate cell'],
  ['endpoint_span', 'START/END span'],
  ['axis_labelled', 'Axis-labelled text'],
  ['paren_pair', 'Parenthetical pair'],
  ['inline_ph_pair', 'Inline PH-range pair'],
  ['dms_pair', 'DMS pair'],
  ['gps_hint', 'GPS hint only'],
];
export const FRAGMENT_KIND_LABELS = Object.fromEntries(FRAGMENT_KIND_OPTIONS);

// Budget-change categories derived from the unified DPWH comparison traces:
// insertion = House-only row, deletion = NEP-only row, adjustments = matched
// pairs whose House amount moved vs the NEP baseline. Only the comparison
// dataset carries this signal; other datasets leave change_type null.
export const CHANGE_TYPE_OPTIONS = [
  ['insertion', 'Insertion (House-only)'],
  ['deletion', 'Deletion (NEP-only)'],
  ['adjustment_increased', 'Adjustment — increased'],
  ['adjustment_decreased', 'Adjustment — decreased'],
  ['no_change', 'Matched, no change'],
  ['unknown', 'Uncertain match'],
  ['none', 'No comparison data'],
];
export const CHANGE_TYPE_LABELS = Object.fromEntries(CHANGE_TYPE_OPTIONS);

/** Filter keys that accept multiple selected values (checkbox lists). */
export const MULTI_FILTER_KEYS = ['dataset', 'group', 'status', 'kind', 'rule', 'issue', 'pap', 'change'];

/** Split a multi-select filter param into an array of values. */
export function parseMulti(value) {
  if (!value) return [];
  return String(value).split('|').map(v => v.trim()).filter(Boolean);
}

/** Join selected values for URL state (empty when nothing/all selected). */
export function serializeMulti(values) {
  return (values || []).filter(Boolean).join('|');
}

/** PHP currency formatting for record cards and tables. */
export function formatAmountPhp(amount) {
  if (!Number.isFinite(amount) || amount == null) return null;
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

export const RULE_LABELS = {
  longitude_first_reordered: 'Longitude-first pair reordered',
  endpoint_colon_restored: 'Endpoint colon restored',
  hemisphere_interpreted: 'Hemisphere marker interpreted',
  decimal_angle_unit_marker_removed: 'Decimal unit marker removed',
  dms_to_decimal_degrees: 'DMS converted to decimal degrees',
  coordinate_axis_labels_removed: 'LAT/LON axis labels removed',
  endpoint_marker_typo_normalized: 'Endpoint marker typo normalized',
  decimal_spacing_removed: 'Decimal spacing removed',
  unicode_angle_punctuation_normalized: 'Unicode angle punctuation normalized',
  endpoint_roles_inferred_from_increasing_stations: 'Roles inferred from increasing stations',
  missing_latitude_decimal_candidate: 'Missing latitude decimal inserted',
  extra_decimal_separator_candidate: 'Extra decimal separator collapsed',
  colon_decimal_separator_candidate: 'Colon used as decimal separator',
  trailing_annotation_preserved: 'Trailing annotation preserved',
  dot_used_as_dms_degree_separator: 'Dot used as DMS degree separator',
  dms_seconds_quote_restored: 'DMS seconds quote restored',
};
export const ISSUE_LABELS = {
  unparsed_coordinate_fragment: 'Unparsed coordinate fragment',
  outside_philippines_orientation_bounds: 'Outside Philippines orientation bounds',
  source_numeric_repair_candidate: 'Source numeric repair candidate',
  invalid_coordinate_pair: 'Invalid coordinate pair',
  single_point_without_endpoint_roles: 'Single point without endpoint roles',
  point_without_endpoint_roles: 'Point without endpoint roles',
};

export function datasetById(data, dataset) {
  return data.datasets.find(d => d.id === dataset) || null;
}

/** Unique interpretation rules/issue/kind codes carried by a record. */
export function recordCodes(record, key) {
  const values = new Set();
  for (const field of record.fields || []) {
    if (key === 'kinds') {
      for (const kind of field.fragment_kinds || []) values.add(kind);
      continue;
    }
    for (const point of field.points || []) {
      for (const value of point[key] || []) values.add(value);
    }
  }
  return [...values];
}

/**
 * Whether a record passes the active filters. Multi-select keys hold an array
 * of values (empty = no restriction); `q` stays a free-text search. Change-type
 * filtering only applies to records that carry a change signal, so selecting
 * any change value hides datasets without comparison traces.
 */
export function recordMatches(record, filters = {}) {
  // Accept either an array of selected values or a single legacy string, but
  // always compare by equality — passing a raw string to Array#includes would
  // silently degrade into substring matching.
  const asList = value => {
    if (value == null || value === '') return [];
    return Array.isArray(value) ? value : [value];
  };
  const any = (key, values) => {
    const list = asList(values);
    return !list.length || list.includes(record[key]);
  };
  const anyCode = (key, values) => {
    const list = asList(values);
    if (!list.length) return true;
    const codes = recordCodes(record, key);
    return list.some(v => codes.includes(v));
  };
  if (!any('dataset', filters.dataset)) return false;
  if (!any('group', filters.group)) return false;
  if (!any('status', filters.status)) return false;
  if (!any('pap', filters.pap)) return false;
  if (!anyCode('kinds', filters.kind)) return false;
  if (!anyCode('rules', filters.rule)) return false;
  if (!anyCode('issues', filters.issue)) return false;
  const changes = asList(filters.change);
  if (changes.length && !changes.includes(record.change_type || 'none')) return false;
  const q = String(filters.q || '').trim().toLowerCase();
  if (q) {
    const amount = formatAmountPhp(record.amount);
    const haystack = [
      record.title, record.record_id, record.dataset, record.pap,
      CHANGE_TYPE_LABELS[record.change_type],
      amount, record.amount,
      ...recordCodes(record, 'kinds'), ...recordCodes(record, 'rules'), ...recordCodes(record, 'issues'),
      ...(record.fields || []).map(f => f.snippet),
    ].filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).every(token => haystack.includes(token))) return false;
  }
  return true;
}

export function filterRecords(records, filters = {}) {
  return records.filter(record => recordMatches(record, filters));
}

/**
 * Philippine orientation envelope, matching the scanner's
 * `philippines_orientation_bounds`. Coordinates outside it are still shown —
 * they are real parse results and the review issue is the point — but they are
 * excluded from the national camera fit.
 *
 * Without this the fit is hijacked by a handful of outliers: 12 of 9,827 points
 * (a `24.8131`/`124.8131` transposition in the source title, a chainage misparse
 * where lon == lat, and two FMR axis swaps) stretched the longitude span to
 * [8.8, 129.8], centring the camera at 69°E in the Arabian Sea and squeezing the
 * entire archipelago into a smudge — which destroys the cluster assessment the
 * map exists to support.
 */
export const PHILIPPINE_BOUNDS = {lat: [4, 22], lon: [116, 127]};

/** True when [lon, lat] sits inside the Philippine orientation envelope. */
export function inPhilippineBounds(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  const {lat, lon} = PHILIPPINE_BOUNDS;
  return lat[0] <= latitude && latitude <= lat[1] && lon[0] <= longitude && longitude <= lon[1];
}

/** Parsed [lon, lat] points of a record in source order. */
export function parsedPoints(record) {
  const points = [];
  for (const field of record.fields || []) {
    for (const point of field.points || []) {
      const {longitude, latitude} = point;
      if (Number.isFinite(longitude) && Number.isFinite(latitude)
        && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90) {
        points.push(point);
      }
    }
  }
  return points;
}

/**
 * Facet option lists for the map filters. Counted over whatever records are
 * passed in — callers pass the *full* record set so that ticking one box never
 * hides its sibling options (counts scoped to the filtered subset would make a
 * facet collapse its own choices as soon as it is used).
 */
export function optionLists(records, data) {
  const statuses = new Map(), kinds = new Map(), changes = new Map();
  const rules = new Map(), issues = new Map();
  for (const record of records) {
    statuses.set(record.status, (statuses.get(record.status) || 0) + 1);
    for (const kind of recordCodes(record, 'kinds')) kinds.set(kind, (kinds.get(kind) || 0) + 1);
    for (const rule of recordCodes(record, 'rules')) rules.set(rule, (rules.get(rule) || 0) + 1);
    for (const issue of recordCodes(record, 'issues')) issues.set(issue, (issues.get(issue) || 0) + 1);
    const change = record.change_type || 'none';
    changes.set(change, (changes.get(change) || 0) + 1);
  }
  const labeled = (counts, labels) => [...counts.entries()]
    .map(([value, count]) => ({value, count, label: labels[value] || value}))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const fromOptions = (options, counts) => options
    .map(([value, label]) => ({value, label, count: counts.get(value) || 0}))
    .filter(o => o.count > 0);
  return {
    datasets: data.datasets.map(d => ({value: d.id, count: d.records, label: d.label})),
    groups: Object.entries(data.groups || {}).map(([value, label]) => ({value, label,
      count: data.datasets.filter(d => d.group === value).reduce((s, d) => s + d.records, 0)}))
      .filter(o => o.count > 0),
    paps: (data.paps || []).map(p => ({value: p.pap, count: p.records, label: p.pap})),
    statuses: fromOptions(STATUS_OPTIONS, statuses),
    kinds: fromOptions(FRAGMENT_KIND_OPTIONS, kinds),
    changes: fromOptions(CHANGE_TYPE_OPTIONS, changes),
    rules: labeled(rules, RULE_LABELS),
    issues: labeled(issues, ISSUE_LABELS),
  };
}

/**
 * MapLibre overlay: one line per record with >=2 parsed points (points joined
 * in source order), one point feature per parsed coordinate.
 */
export function buildOverlay(records, data) {
  const colors = {...GROUP_COLORS, ...Object.fromEntries(
    (data.datasets || []).map(d => [d.id, GROUP_COLORS[d.group] || '#334155']))};
  const lines = [], points = [];
  for (const record of records) {
    const color = colors[record.group] || '#334155';
    const recordPoints = parsedPoints(record);
    const geometry = recordPoints.map(p => [p.longitude, p.latitude]);
    const base = {
      dataset: record.dataset, group: record.group, recordId: record.record_id,
      title: record.title, status: record.status,
      amount: record.amount ?? null, changeType: record.change_type || null,
    };
    if (geometry.length >= 2) {
      lines.push({type: 'Feature', properties: {color, pointCount: geometry.length, ...base},
        geometry: {type: 'LineString', coordinates: geometry}});
    }
    for (const p of recordPoints) {
      points.push({type: 'Feature', properties: {color, ...base, role: p.role || 'unspecified',
        rules: p.rules || [], issues: p.issues || [], fragment: p.source_fragment || '',
        // Drives the camera fit and the outlier notice. Out-of-envelope points
        // stay plotted (they are genuine parse results and the issue is the
        // finding) but must not dictate where the national view centres.
        inBounds: inPhilippineBounds(p.longitude, p.latitude)},
        geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]}});
    }
  }
  const outOfBounds = points.filter(f => !f.properties.inBounds).length;
  return {
    lines: {type: 'FeatureCollection', features: lines},
    points: {type: 'FeatureCollection', features: points},
    summary: {
      records: records.length,
      drawnLines: lines.length,
      drawnPoints: points.length,
      outOfBounds,
      parsed: records.filter(r => r.status === 'parsed').length,
      withIssues: records.filter(r => r.status === 'parsed_with_issues').length,
      unparsed: records.filter(r => r.status === 'unparsed_candidate').length,
      hints: records.filter(r => r.status === 'hint_only').length,
    },
  };
}

/**
 * Canonical record links. Each dataset references its project record
 * differently (comparison rows, tree nodes, workbench facility ids…), so the
 * workbench builder attaches evidence refs with tree locations; this resolves
 * them (with the dataset deep_link fallbacks) into hash URLs.
 */
export function recordHref(record) {
  const link = record.link;
  if (!link) return null;
  const prefix = link.workspace === 'dpwh' ? '' : `${link.workspace}/`;
  // The DPWH Compare view selects records with `record=`; tree views use `node=`.
  const params = new URLSearchParams(link.params || {});
  params.set(link.route === 'compare' ? 'record' : 'node', link.node);
  if (link.route === 'compare') params.set('view', 'projects');
  return `#${prefix}${link.route}?${params.toString()}`;
}

/** Evidence refs of a record that can open a PDF preview (valid page). */
export function recordPdfSources(record, documents) {
  const byKey = new Map((documents || []).map(d => [d.key, d]));
  const refs = [];
  for (const source of record.sources || []) {
    const doc = byKey.get(source.document);
    if (!doc) continue;
    const page = source.pdf_page;
    if (!Number.isInteger(page) || page < 1 || page > doc.pages) continue;
    refs.push({...source, label: doc.label, pdf: doc.pdf, page});
  }
  return refs;
}

/** Interpretation variation tables for the home view. */
export function variationRows(records) {
  const rules = new Map(), issues = new Map(), kinds = new Map();
  for (const record of records) {
    for (const kind of recordCodes(record, 'kinds')) kinds.set(kind, (kinds.get(kind) || 0) + 1);
    for (const rule of recordCodes(record, 'rules')) rules.set(rule, (rules.get(rule) || 0) + 1);
    for (const issue of recordCodes(record, 'issues')) issues.set(issue, (issues.get(issue) || 0) + 1);
  }
  const rows = (counts, labels, category) => [...counts.entries()]
    .map(([code, count]) => ({code, count, label: labels[code] || code, category}))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    kinds: rows(kinds, FRAGMENT_KIND_LABELS, 'kind'),
    rules: rows(rules, RULE_LABELS, 'rule'),
    issues: rows(issues, ISSUE_LABELS, 'issue'),
  };
}

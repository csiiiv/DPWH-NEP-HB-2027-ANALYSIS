/** Group-relation model: harvested matcher output as honest relation views.
 *
 * Works on the group_relations_*_2027.json sidecars built by
 * analysis/builders/build_group_relations.py. Those files harvest what the
 * matcher actually saw — committed attachments, review-only attachments,
 * open candidates, duplicate keys, cross-PAP twins and measured span
 * overlaps — and assign every row exactly one explicit state. Nothing here
 * re-matches or re-scores: if a function in this module ever disagrees with
 * the dashboard, the dashboard is right and the sidecar is stale.
 */

/** Rank for display ordering: committed > review > duplicate > twin > open. */
export const STATE_ORDER = [
  "committed_attached",
  "review_attached",
  "duplicate_key",
  "twin_cross_referenced",
  "open_candidate",
  "unmatched_insertion",
  "unmatched_deletion",
];

export const STATE_LABELS = {
  committed_attached: "Committed",
  review_attached: "Review-only",
  duplicate_key: "Duplicate key",
  twin_cross_referenced: "Twin cross-ref",
  open_candidate: "Open candidate",
  unmatched_insertion: "Unmatched (unsupported insertion)",
  unmatched_deletion: "Unmatched (deletion)",
};

/** Decode the compact id -> [state_index, side_index] overlay.
 *
 * Returns a Map keyed by the exact row id string so callers can look up
 * states without coercing ids. Side is "house" or "nep".
 */
export function decodeStateOverlay(statesPayload) {
  const names = statesPayload?.states ?? STATE_ORDER;
  const sides = statesPayload?.sides ?? ["house", "nep"];
  const map = new Map();
  for (const [id, entry] of Object.entries(statesPayload?.rows ?? {})) {
    map.set(id, {
      state: names[entry[0]] ?? "unknown",
      side: sides[entry[1]] ?? "unknown",
      ...(statesPayload?.detail?.[id] ?? {}),
    });
  }
  return map;
}

/** State census rows for the summary strip, in display order. */
export function censusRows(summary, stateDefinitions = null) {
  const census = summary?.state_census ?? {};
  return STATE_ORDER.map((state) => ({
    state,
    label: STATE_LABELS[state],
    description: stateDefinitions?.[state],
    ...census[state],
  }));
}

/** Findings of one type, richest first (payload is already sorted). */
export function findingsOfType(findingsPayload, type) {
  return (findingsPayload?.findings ?? []).filter((f) => f.type === type);
}

/** Per-type headline: count and money at stake. */
export function findingHeadlines(findingsPayload) {
  const types = findingsPayload?.types ?? [];
  return types.map((type) => ({
    type,
    count: findingsPayload?.counts?.[type] ?? 0,
    amount: findingsPayload?.amount_at_stake_by_type?.[type] ?? 0,
    description: findingsPayload?.type_definitions?.[type],
  }));
}

/** Overlap spectrum rows ready for a table (bounds already declared). */
export function spectrumRows(indexPayload) {
  return (indexPayload?.overlap_spectrum ?? []).map((b) => ({
    ...b,
    sampleCount: b.sample?.length ?? 0,
  }));
}

/** Bucket label for a ratio, replaying the builder's declared bounds.
 *
 * The bounds ship with each bucket (lo exclusive, hi per include_hi, both
 * null meaning exactly zero) so this is a replay, not a re-derivation.
 */
export function bucketFor(indexPayload, ratio) {
  for (const bucket of indexPayload?.overlap_spectrum ?? []) {
    const { lo, hi, include_hi } = bucket;
    if (lo == null && hi == null) {
      if (ratio === 0) return bucket.bucket;
    } else if (hi == null) {
      if (ratio >= lo) return bucket.bucket;
    } else if (include_hi ? lo < ratio && ratio <= hi : lo < ratio && ratio < hi) {
      return bucket.bucket;
    }
  }
  return null;
}

/** Rows of one rostered shell for the drilldown, with states attached.
 *
 * Members come from the roster entry (both sides, including rows no edge
 * touched); states come from the overlay; per-shell edges are selected with
 * the shell stamp every edge carries. Unsupplied rows are the ones with no
 * committed/review state — exactly what an unsupplied_shell finding names.
 */
export function shellRows(shellEntry, nodes, stateOverlay, edges) {
  const rows = [];
  for (const side of ["house", "nep"]) {
    for (const id of shellEntry?.[`${side}_ids`] ?? []) {
      const state = stateOverlay.get(String(id));
      rows.push({
        id,
        side,
        node: nodes?.[id] ?? null,
        state: state?.state ?? "unseen",
        matcherStatus: state?.matcher_status ?? null,
        edges: (edges ?? []).filter(
          (e) => e.shell === shellEntry?.shell && (e.house === id || e.nep === id),
        ),
      });
    }
  }
  const rank = (r) => STATE_ORDER.indexOf(r.state);
  rows.sort(
    (a, b) =>
      (a.side === "house" ? 0 : 1) - (b.side === "house" ? 0 : 1) ||
      rank(a.state) - rank(b.state) ||
      (b.node?.amount_php ?? 0) - (a.node?.amount_php ?? 0),
  );
  return rows;
}

/** Which rows of a shell are "unsupplied": present but never consumed. */
const CONSUMED_STATES = new Set(["committed_attached", "review_attached"]);

export function unsuppliedRows(shellRowsResult) {
  return shellRowsResult.filter((r) => !CONSUMED_STATES.has(r.state));
}

/** Select findings for the table given active type/region filters. */
export function filterFindings(findings, { type = "all", region = "all" } = {}) {
  return findings.filter(
    (f) =>
      (type === "all" || f.type === type) &&
      (region === "all" || !f.region || f.region === region),
  );
}

/** Region options, restricted to regions that actually carry findings.
 *
 * Deliberately does NOT union in roster regions: a region with no findings
 * would render as a selectable filter that returns an empty table — a
 * dead-end option. Ranked by finding count, then name, so the dropdown leads
 * with where the most is at stake.
 */
export function regionOptions(findings) {
  const counts = new Map();
  for (const f of findings) {
    if (f.region) counts.set(f.region, (counts.get(f.region) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([region, count]) => ({ region, count }));
}

/* --- presentation helpers --------------------------------------------- */
/* Everything below is pure and sidecar-driven: it reshapes builder output for
   rendering and never re-derives a number the builder already stated. */

/** CSS class for a state pill. Falls back to the neutral `unseen` tint so an
 * unknown state still renders as a pill rather than as raw text. */
export function stateClass(state) {
  return `rv-state rv-state--${STATE_ORDER.includes(state) ? state : "unseen"}`;
}

/** Row count per sub-view, straight from the index summary.
 *
 * Used for the tab badges so a reader knows how large a sub-view is before
 * paying for its sidecar. Counts are the builder's own, never recomputed
 * here; a missing field yields null and the badge is simply omitted.
 */
export function tabCounts(summary) {
  const findingTotal = Object.values(summary?.finding_counts ?? {}).reduce(
    (sum, n) => sum + (Number.isFinite(n) ? n : 0),
    0,
  );
  const pick = (value) => (Number.isFinite(value) && value > 0 ? value : null);
  return {
    states: pick(summary?.rows_stated),
    findings: pick(findingTotal),
    ambiguity: pick(summary?.competing_shells),
    twins: pick(summary?.twin_pairs),
    overlaps: pick(summary?.measured_pairs),
  };
}

/** Human label for any state the overlay can emit, including the ones the
 * builder never assigns (a row referenced but not harvested). */
export function stateLabel(state) {
  if (STATE_LABELS[state]) return STATE_LABELS[state];
  // "unseen" is what shellRows assigns a member row the overlay never covered.
  if (state === "unseen") return "Not in overlay";
  return state ?? "unknown";
}

/** Proportional segments for the census bar, in confidence-ladder order.
 *
 * Widths are percentages of rows stated, with one deliberate distortion that
 * is flagged rather than hidden: a state with any rows gets a minimum width
 * (`floorPct`) so the few dozen review-only or duplicate-key rows stay
 * visible instead of rendering as a sub-pixel sliver. The states that exceed
 * the floor share the remaining budget in proportion, so widths still total
 * exactly 100 and every floored segment carries `floored: true` for the
 * caller to annotate.
 *
 * States with no rows are dropped so the bar is not full of zero-width
 * segments. Returns an empty array rather than NaN segments when the census
 * is absent or all-zero — the bar then renders as an empty track.
 */
export function censusSegments(rows, floorPct = 1.2) {
  const withCounts = (rows ?? [])
    .map((r) => ({
      state: r.state,
      label: r.label,
      rows: Number.isFinite(r.rows) ? r.rows : 0,
    }))
    .filter((r) => r.rows > 0);
  const total = withCounts.reduce((sum, r) => sum + r.rows, 0);
  if (!total) return [];
  // Never floor past the point where widths stop summing to 100.
  const floor = Math.max(0, Math.min(floorPct, 100 / withCounts.length));
  const exceeds = (r) => (r.rows / total) * 100 >= floor;
  const rest = withCounts.filter(exceeds);
  const restRows = rest.reduce((sum, r) => sum + r.rows, 0);
  const budget = 100 - floor * (withCounts.length - rest.length);
  return withCounts.map((r) => {
    const floored = !exceeds(r);
    return {
      ...r,
      share: r.rows / total,
      widthPct: floored ? floor : restRows ? (r.rows / restRows) * budget : 0,
      floored,
    };
  });
}

/** Group a shell's member rows by side, with per-side totals.
 *
 * Totals sum the node bodies the roster ships; rows whose body is missing are
 * still counted (membership is the roster's claim) but contribute no money,
 * and that is reported separately so a total can never silently understate.
 */
export function shellLedger(rows) {
  const ledger = { house: [], nep: [] };
  for (const row of rows) {
    if (row.side === "house" || row.side === "nep") ledger[row.side].push(row);
  }
  const side = (list) => {
    const missing = list.filter((r) => !r.node).length;
    return {
      rows: list,
      count: list.length,
      total: list.reduce((sum, r) => sum + (r.node?.amount_php ?? 0), 0),
      missingBodies: missing,
      unsupplied: unsuppliedRows(list).length,
    };
  };
  return { house: side(ledger.house), nep: side(ledger.nep) };
}

/** Evidence tags for one finding, as short labelled chips.
 *
 * One tag per piece of evidence the builder actually shipped for that type —
 * the six finding types carry different fields, so this is a per-type map
 * rather than one generic shape. Every tag states a count or a value the
 * builder computed; nothing here re-derives a measurement.
 */
export function findingTags(finding) {
  if (!finding) return [];
  const tags = [];
  const push = (key, label, tone = "") => {
    if (label) tags.push({ key, label, tone });
  };
  const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
  const rivals = finding.rival_nodes?.length ?? 0;
  const committed = finding.committed_nodes?.length ?? 0;
  const unsupplied = finding.unsupplied_ids?.length ?? 0;

  if (rivals) push("rivals", plural(rivals, "rival"), rivals > 1 ? "warn" : "");
  if (committed) push("committed", plural(committed, "committed"));
  if (unsupplied) {
    // Name which side is short: an unsupplied NEP row is a deletion candidate,
    // an unsupplied House row an insertion candidate.
    const side = finding.unsupplied_side === "nep" ? "NEP" : finding.unsupplied_side === "house" ? "HGAB" : "";
    push("unsupplied", `${plural(unsupplied, "unsupplied")}${side ? ` · ${side}` : ""}`, "warn");
  }
  if (finding.house && finding.nep) push("pair", "pair");
  if (finding.overlap_ratio != null) {
    push(
      "overlap",
      `${(finding.overlap_ratio * 100).toFixed(1)}% overlap`,
      finding.overlap_ratio === 0 ? "withheld" : "",
    );
  }
  if (finding.delta_booked === false && finding.delta_php != null) {
    push("withheld", `Δ withheld`, "withheld");
  }
  // shell_amount_gap carries the two side totals rather than a pair. Money is
  // left to the caller: this module stays import-free and pure, and the view
  // already has the shared amount() formatter. The tag states the direction,
  // which is the part a reader needs before opening the shell.
  if (finding.house_amount_php != null && finding.nep_amount_php != null) {
    const gap = finding.house_amount_php - finding.nep_amount_php;
    push(
      "gap",
      gap > 0 ? "HGAB above NEP" : gap < 0 ? "NEP above HGAB" : "sides equal",
      gap !== 0 ? "warn" : "",
    );
  }
  // Row counts both sides explain why a shell is contested or short.
  if (finding.house_rows != null || finding.nep_rows != null) {
    push("rows", `${finding.house_rows ?? 0} HGAB · ${finding.nep_rows ?? 0} NEP`);
  }
  const kinds = Object.keys(finding.edge_kinds ?? {});
  if (kinds.length) push("kinds", kinds.join(" / "));
  if (finding.rival_degrees && rivals) {
    const max = Math.max(...Object.values(finding.rival_degrees));
    if (max > 1) push("degree", `degree ${max}`, "warn");
  }
  return tags;
}

/** Scale factors for a set of values so bars share one maximum.
 *
 * Returns percentages keyed by index. Pass `max` for a quantity with a known
 * natural ceiling — an overlap ratio is bounded by 1.0, and scaling against
 * the largest value in view would exaggerate it whenever every visible pair
 * is small or zero. With no `max`, scales against the largest value present;
 * an all-zero or empty set yields an empty map so bars render as empty tracks
 * rather than dividing by zero.
 */
export function barScale(values, max = null) {
  const finite = (values ?? []).map((v) => (Number.isFinite(v) ? Math.abs(v) : 0));
  const ceiling = max != null && max > 0 ? max : Math.max(0, ...finite);
  if (!ceiling) return new Map();
  return new Map(finite.map((v, i) => [i, Math.min(100, (v / ceiling) * 100)]));
}



/** URL params for switching to a Relations sub-tab.
 *
 * The tabs are links, so a switch is a real navigation that the reader can
 * share and close with the browser back button. Two params are settled here:
 *
 * - `tab` is dropped entirely for the default `states` view, so a shared link
 *   does not carry a redundant `?tab=states`.
 * - `rshell` is always dropped. A shell drilldown belongs to the tab it was
 *   opened from; carrying it across would re-open the same modal on the new
 *   tab. The router's `changedParams` only clears stale keys on *view*
 *   changes, so a tab change has to clear it itself.
 *
 * Returns a plain object suitable for `routeHref`, which filters out nulls.
 */
export function tabParams(params, tab) {
  const next = Object.fromEntries(params ?? []);
  next.tab = tab && tab !== "states" ? tab : null;
  delete next.rshell;
  return next;
}

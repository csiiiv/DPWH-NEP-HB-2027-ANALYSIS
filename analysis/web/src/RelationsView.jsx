import React, { useEffect, useMemo, useRef, useState } from "react";
import SortableTable from "./SortableTable.jsx";
import LoadingModal from "./LoadingModal.jsx";
import { openModalDialog } from "./modalLifecycle.js";
import { loadData } from "./data.js";
import { routeHref } from "./routes.js";
import { amount } from "./model.js";
import { regionName } from "./regionNames.js";
import {
  barScale,
  bucketFor,
  censusRows,
  censusSegments,
  decodeStateOverlay,
  filterFindings,
  findingHeadlines,
  findingTags,
  regionOptions,
  shellLedger,
  shellRows,
  stateClass,
  stateLabel,
  tabCounts,
  tabParams,
  unsuppliedRows,
} from "./groupRelations.js";
import "./RelationsView.css";

/** Relations view: what the matcher committed, withheld, and left open.
 *
 * Loads the light index first, then heavier sidecars on demand per sub-view.
 * Everything shown is harvested from the matcher's own output — this view
 * can surface what the dashboard did NOT book (open candidates, twins,
 * withheld deltas), but it can never contradict what the dashboard DID book.
 */
const TABS = [
  ["states", "States"],
  ["findings", "Findings"],
  ["ambiguity", "Ambiguity"],
  ["twins", "Twins"],
  ["overlaps", "Overlaps"],
];
const FINDING_LABELS = {
  committed_with_rivals: "Committed with rivals",
  competing_candidates: "Competing candidates",
  shell_amount_gap: "Shell amount gap",
  unsupplied_shell: "Unsupplied shells",
  zero_overlap_attached: "Zero-overlap attachments",
  cross_pap_twin: "Cross-PAP twins",
};
// Findings is the largest sub-view (990 rows); paginating keeps the table
// scannable instead of dumping a wall of rows the reader must scroll past.
const PAGE = 50;

const sidecarNames = {
  index: "group_relations_index_2027.json",
  shells: "group_relations_shells_2027.json",
  states: "group_relations_states_2027.json",
  findings: "group_relations_findings_2027.json",
  ambiguity: "group_relations_ambiguity_2027.json",
  twins: "group_relations_twins_2027.json",
  overlaps: "group_relations_overlaps_2027.json",
};

const Loading = ({ children }) => (
  <p role="status" className="rv-loading">{children}</p>
);

const Money = ({ value, tone = "" }) => (
  <span
    className={`rv-money${tone ? ` rv-money--${tone}` : ""}`}
    title={value != null ? `${value.toLocaleString("en-PH")} PHP` : undefined}
  >
    {amount(value)}
  </span>
);

const StatePill = ({ state }) => (
  <span className={stateClass(state)}>{stateLabel(state)}</span>
);

/** Evidence chips for a finding: every tag names something the builder
 * measured, so the reader can judge the row before opening the shell. */
const Tags = ({ tags }) =>
  tags.length ? (
    <span className="rv-chipline">
      {tags.map((t) => (
        <span key={t.key} className={`rv-tag${t.tone ? ` rv-tag--${t.tone}` : ""}`}>
          {t.label}
        </span>
      ))}
    </span>
  ) : null;

const OpenShell = ({ label, onOpen }) => (
  <button type="button" className="rv-open-shell" onClick={(e) => { e.stopPropagation(); onOpen(label); }}>
    Open shell <span aria-hidden="true">→</span>
  </button>
);

/** Sub-view tab strip.
 *
 * These are links, not buttons: each tab changes the URL, so it must be
 * shareable and closable with the browser back button, and the active one
 * carries aria-current — the same contract as the analysis-subtabs strip in
 * Analysis.jsx, per UI_CONSISTENCY_PLAN. tabParams settles the two params a
 * switch owns (drop the default `states`, drop any open shell drilldown).
 */
export function RelationTabs({ params, tab, counts }) {
  const href = (next) => routeHref("analysis", tabParams(params, next));
  return (
    <nav className="relations-tabs" aria-label="Relation sub-views">
      {TABS.map(([id, label]) => (
        <a key={id} href={href(id)} aria-current={tab === id ? "page" : undefined}>
          {label}
          {/* Truthiness, not `!= null`: a zero count renders no badge. tabCounts
              already normalises zero to null, so this is the second line of
              defence should another caller pass raw counts — a "0" pill next
              to a tab that opens an empty table is noise, not information. */}
          {!!counts[id] && (
            <span className="relations-tab-count">{counts[id].toLocaleString()}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

export default function RelationsView({ route, change }) {
  const [payloads, setPayloads] = useState({});
  const [error, setError] = useState("");
  const tab = route.params.get("tab") ?? "states";
  const openShell = route.params.get("rshell");

  // One fetch per sidecar per session. `payloads` only covers requests that
  // have *resolved*, so in-flight ones are tracked separately: a click
  // prefetch followed immediately by the drilldown effect would otherwise
  // start two concurrent downloads of the same roster. A ref rather than
  // state, because the guard must be readable in the same tick as the
  // second call.
  const inflight = useRef(new Map());
  const load = (name) => {
    if (!name || payloads[name] || inflight.current.has(name)) return undefined;
    const c = new AbortController();
    inflight.current.set(name, c);
    const settle = () => inflight.current.delete(name);
    loadData(name, c.signal)
      .then((payload) => setPayloads((p) => ({ ...p, [name]: payload })))
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(settle);
    return () => c.abort();
  };
  // Abort anything still in flight on unmount, so a slow roster fetch cannot
  // land and setState after teardown.
  useEffect(() => {
    const pending = inflight.current;
    return () => {
      for (const c of pending.values()) c.abort();
      pending.clear();
    };
  }, []);

  const index = payloads[sidecarNames.index];
  const shells = payloads[sidecarNames.shells];
  const states = payloads[sidecarNames.states];

  // The index always loads first: it carries the summary, spectrum and the
  // definitions every tab cites.
  useEffect(() => load(sidecarNames.index), []);
  // The active tab's sidecar loads on demand and stays cached. `states`
  // deliberately maps to nothing: the census renders from the index's own
  // state_census + state_definitions, so the default first paint needs only
  // the 0.03 MB index. The 2.2 MB per-row overlay loads later, on drilldown,
  // where individual row states are actually shown.
  const sidecarFor = {
    findings: sidecarNames.findings,
    ambiguity: sidecarNames.ambiguity,
    twins: sidecarNames.twins,
    overlaps: sidecarNames.overlaps,
  };
  // Each effect returns load()'s abort cleanup, so switching tabs (or
  // unmounting) cancels a sidecar still in flight instead of racing it.
  useEffect(() => load(sidecarFor[tab]), [tab]);
  // A drilldown needs the roster (and per-row states) regardless of tab.
  useEffect(() => {
    if (!openShell) return;
    const abortRoster = load(sidecarNames.shells);
    const abortStates = load(sidecarNames.states);
    return () => {
      abortRoster?.();
      abortStates?.();
    };
  }, [openShell]);

  if (error) return <p role="alert" className="muted">{error}</p>;
  if (!index) return <Loading>Loading relation index…</Loading>;

  const summary = index.summary;
  const counts = tabCounts(summary);
  const open = summary.state_census.open_candidate.rows +
    summary.state_census.duplicate_key.rows +
    summary.state_census.twin_cross_referenced.rows;
  // The roster is needed by every drilldown, not just the findings tab.
  const openRoster = (label) => {
    load(sidecarNames.shells);
    change("rshell", label);
  };

  return (
    <section className="analysis-section relations-view">
      <h2>Relations · states, findings and cross-references</h2>
      <p className="muted">
        Every House (HGAB) and NEP row carries exactly one <strong>state</strong> —
        what the matcher committed, attached for review only, cross-referenced,
        or deliberately left open. Findings enumerate what a reader should look
        at, with the money at stake; they are observations, never verdicts.
        Harvested from the same matching output as the dashboard, so the two
        can surface different things but cannot contradict each other.
      </p>
      <dl className="stat-strip">
        <div>
          <dt>Rows with an explicit state</dt>
          <dd>{summary.rows_stated.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Committed attachments</dt>
          <dd>
            {summary.state_census.committed_attached.rows.toLocaleString()}
            <small>money booked</small>
          </dd>
        </div>
        <div className="is-withheld">
          <dt>Review-only · delta withheld</dt>
          <dd>
            {summary.state_census.review_attached.rows.toLocaleString()}
            <small>paired, not booked</small>
          </dd>
        </div>
        <div className="is-open">
          <dt>Open possibilities</dt>
          <dd>
            {open.toLocaleString()}
            <small>unresolved, nothing consumed</small>
          </dd>
        </div>
        <div>
          <dt>Money at stake in findings</dt>
          <dd>{amount(summary.findings_amount_at_stake_php)}</dd>
        </div>
        <div className="is-withheld">
          <dt>Zero-overlap pairs · delta withheld</dt>
          <dd>
            {summary.zero_overlap_pairs.toLocaleString()}
            <small>{amount(summary.zero_overlap_gross_abs_delta_php)} gross |Δ|</small>
          </dd>
        </div>
      </dl>
      <RelationTabs params={route.params} tab={tab} counts={counts} />
      {tab === "states" && <StatesTab index={index} states={states} />}
      {tab === "findings" && (
        <FindingsTab findings={payloads[sidecarNames.findings]} onOpenShell={openRoster} />
      )}
      {tab === "ambiguity" && (
        <AmbiguityTab payload={payloads[sidecarNames.ambiguity]} onOpenShell={openRoster} />
      )}
      {tab === "twins" && (
        <TwinsTab payload={payloads[sidecarNames.twins]} onOpenShell={openRoster} />
      )}
      {tab === "overlaps" && (
        <OverlapsTab
          index={index}
          payload={payloads[sidecarNames.overlaps]}
          onOpenShell={openRoster}
        />
      )}
      {openShell &&
        (shells && states ? (
          <ShellModal
            label={openShell}
            shellsPayload={shells}
            statesPayload={states}
            onClose={() => change("rshell", null)}
          />
        ) : (
          <LoadingModal
            eyebrow="SHELL RELATIONS"
            title={openShell}
            note="Loading shell roster and row states…"
            onClose={() => change("rshell", null)}
          />
        ))}
    </section>
  );
}

// Sub-views are exported as well as rendered internally so the render test can
// exercise each with real payloads. renderToStaticMarkup never runs effects,
// so the parent alone would only ever show its loading branch; and the parent's
// data comes from async fetches no static render can await.
export function StatesTab({ index, states }) {
  // Definitions and the census both ship in the index, so this tab paints
  // without fetching the per-row overlay.
  const rows = useMemo(
    () => censusRows(index.summary, index.state_definitions),
    [index],
  );
  const segments = useMemo(() => censusSegments(rows), [rows]);
  const overlaySize = Object.keys(states?.rows ?? {}).length;
  const total = index.summary.rows_stated;
  const floored = segments.filter((s) => s.floored);
  return (
    <>
      <h3>Row states · one explicit state per row</h3>
      <p className="rv-note">{index.states_note}</p>

      {segments.length > 0 && (
        <>
          <div
            className="rv-census-bar"
            role="img"
            aria-label={`Proportional census of ${total.toLocaleString()} stated rows: ${segments
              .map((s) => `${s.label} ${(s.share * 100).toFixed(1)}%`)
              .join(", ")}`}
          >
            {segments.map((s) => (
              <span
                key={s.state}
                className={`rv-census-seg rv-fill--${s.state}`}
                style={{ width: `${s.widthPct}%` }}
                title={`${s.label}: ${s.rows.toLocaleString()} rows (${(s.share * 100).toFixed(2)}%)${
                  s.floored ? " — drawn wider than true share so it stays visible" : ""
                }`}
              />
            ))}
          </div>
          <ul className="rv-census-legend">
            {segments.map((s) => (
              <li key={s.state}>
                <i className={`rv-fill--${s.state}`} aria-hidden="true" />
                {s.label} <b>{s.rows.toLocaleString()}</b>
                {(s.share * 100).toFixed(1)}%
                {s.floored && <span title="Drawn wider than its true share so a small state stays visible">*</span>}
              </li>
            ))}
          </ul>
          {floored.length > 0 && (
            <p className="muted">
              * {floored.map((s) => s.label).join(", ")} are drawn wider than
              their true share ({floored.map((s) => `${(s.share * 100).toFixed(2)}%`).join(", ")})
              so a small state stays visible. The counts and the table below are
              exact — only the bar width is distorted.
            </p>
          )}
        </>
      )}

      <SortableTable
        tableId="relations-states"
        ariaLabel="Row states census"
        initialSort={{ key: "rows", direction: "desc" }}
        rows={rows}
        columns={[
          {
            key: "label",
            label: "State",
            scope: "row",
            value: (r) => r.state,
            render: (r) => (
              <span className="cell-main">
                <StatePill state={r.state} />
                <small>{r.description}</small>
              </span>
            ),
          },
          { key: "rows", label: "Rows", align: "num" },
          {
            key: "share",
            label: "Share",
            align: "num",
            value: (r) => (Number.isFinite(r.rows) ? r.rows : -1),
            render: (r) =>
              Number.isFinite(r.rows) && total
                ? `${((r.rows / total) * 100).toFixed(2)}%`
                : "—",
          },
          { key: "house_rows", label: "House (HGAB)", align: "num" },
          { key: "nep_rows", label: "NEP", align: "num" },
          {
            key: "amount_php",
            label: "Amount carried",
            align: "num",
            render: (r) => <Money value={r.amount_php} />,
          },
        ]}
        empty="No states."
      />
      <p className="muted">
        {total.toLocaleString()} rows are stated in total.
        {overlaySize
          ? ` The per-row overlay loaded here covers ${overlaySize.toLocaleString()} of them.`
          : " Open a finding's shell to inspect individual rows — the per-row overlay loads on demand, and a full per-row table is intentionally never rendered."}
      </p>
    </>
  );
}

export function FindingsTab({ findings, onOpenShell }) {
  const [type, setType] = useState("all");
  const [region, setRegion] = useState("all");
  const regions = useMemo(
    () => regionOptions(findings?.findings ?? []),
    [findings],
  );
  if (!findings) return <Loading>Loading findings…</Loading>;
  const headlines = findingHeadlines(findings);
  const shown = filterFindings(findings.findings, { type, region });
  return (
    <>
      <h3>Findings · what to look at, ranked by money at stake</h3>
      <p className="rv-note">{findings.note}</p>
      <dl className="stat-strip">
        {headlines.map((h) => (
          <div key={h.type}>
            <dt>{FINDING_LABELS[h.type] ?? h.type}</dt>
            <dd>
              {h.count.toLocaleString()}
              <small>{amount(h.amount)} at stake</small>
            </dd>
          </div>
        ))}
      </dl>
      <div className="relations-filters">
        <label>
          Type
          <select aria-label="Finding type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {findings.types.map((t) => (
              <option key={t} value={t}>
                {FINDING_LABELS[t] ?? t} ({(findings.counts?.[t] ?? 0).toLocaleString()})
              </option>
            ))}
          </select>
        </label>
        <label>
          Region
          <select aria-label="Finding region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">All regions</option>
            {regions.map((o) => (
              <option key={o.region} value={o.region}>
                {regionName(o.region)} ({o.count})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rv-result-count" role="status">
        {shown.length.toLocaleString()} of {findings.findings.length.toLocaleString()} findings
        {(type !== "all" || region !== "all") && (
          <>
            {" "}· <button type="button" className="group-open" onClick={() => { setType("all"); setRegion("all"); }}>clear filters</button>
          </>
        )}
      </p>
      <SortableTable
        tableId="relations-findings"
        ariaLabel="Findings"
        initialSort={{ key: "amount_at_stake_php", direction: "desc" }}
        pageSize={PAGE}
        rows={shown}
        columns={[
          {
            key: "type",
            label: "Type",
            scope: "row",
            value: (r) => r.type,
            render: (r) => (
              <span className="cell-main">
                {FINDING_LABELS[r.type] ?? r.type}
                <small>{findings.type_definitions?.[r.type]}</small>
              </span>
            ),
          },
          {
            key: "title",
            label: "Where",
            render: (r) => (
              <span className="cell-main">
                {r.title ?? "—"}
                <small>
                  {r.region ? regionName(r.region) : "no recorded region"}
                  {r.kind === "road" ? " · road corridor" : r.kind === "place_shell" ? " · place shell" : ""}
                </small>
              </span>
            ),
          },
          {
            key: "amount_at_stake_php",
            label: "At stake",
            align: "num",
            render: (r) => (
              <Money
                value={r.amount_at_stake_php}
                tone={r.type === "zero_overlap_attached" ? "withheld" : ""}
              />
            ),
          },
          {
            key: "evidence",
            label: "Evidence",
            sortable: false,
            value: (r) => findingTags(r).length,
            render: (r) => (
              <span className="evidence-cells">
                {r.shell && <OpenShell label={r.shell} onOpen={onOpenShell} />}
                <Tags tags={findingTags(r)} />
              </span>
            ),
          },
        ]}
        empty="No findings match the filters."
      />
    </>
  );
}

export function AmbiguityTab({ payload, onOpenShell }) {
  if (!payload) return <Loading>Loading ambiguity subset…</Loading>;
  return (
    <>
      <h3>Ambiguity · rows with several plausible counterparts</h3>
      <p className="rv-note">{payload.note}</p>
      <SortableTable
        tableId="relations-ambiguity"
        ariaLabel="Competing shells"
        initialSort={{ key: "amount_gap_php", direction: "desc" }}
        pageSize={PAGE}
        rows={payload.shells}
        columns={[
          {
            key: "title",
            label: "Shell",
            scope: "row",
            render: (r) => (
              <span className="cell-main">
                {r.title}
                <small>
                  {regionName(r.region)} · {r.kind === "road" ? "road corridor" : "place shell"}
                </small>
              </span>
            ),
          },
          {
            key: "competing_nodes",
            label: "Competing rows",
            align: "num",
            render: (r) => (
              <span className="rv-money">{r.competing_nodes?.toLocaleString() ?? "—"}</span>
            ),
          },
          {
            key: "edges",
            label: "Edge kinds",
            align: "num",
            value: (r) => r.edges,
            render: (r) => (
              <span className="rv-edges">
                {Object.keys(r.edge_kinds ?? {}).length
                  ? Object.entries(r.edge_kinds).map(([k, n]) => (
                      <span key={k} className={`rv-edge-kind rv-edge-kind--${k}`}>
                        {k} {n}
                      </span>
                    ))
                  : `${r.edges}`}
              </span>
            ),
          },
          {
            key: "amount_gap_php",
            label: "Amount gap",
            align: "num",
            render: (r) => (
              <Money
                value={r.amount_gap_php}
                tone={(r.amount_gap_php ?? 0) < 0 ? "neg" : (r.amount_gap_php ?? 0) > 0 ? "pos" : ""}
              />
            ),
          },
          {
            key: "open",
            label: "Open edges",
            align: "num",
            value: (r) => (r.has_open_edges ? 1 : 0),
            render: (r) =>
              r.has_open_edges ? (
                <span className="rv-tag rv-tag--warn">
                  {(r.open_kinds ?? []).join(" / ") || "open"}
                </span>
              ) : (
                <span className="rv-tag">all committed</span>
              ),
          },
          {
            key: "drill",
            label: "Open",
            sortable: false,
            width: "1%",
            render: (r) =>
              r.shell ? <OpenShell label={r.shell} onOpen={onOpenShell} /> : "—",
          },
        ]}
        empty="No competing shells."
      />
    </>
  );
}

export function TwinsTab({ payload, onOpenShell }) {
  if (!payload) return <Loading>Loading twins…</Loading>;
  return (
    <>
      <h3>Twins · identical rows under different program sections</h3>
      <p className="rv-note">{payload.note}</p>
      <SortableTable
        tableId="relations-twins"
        ariaLabel="Cross-PAP twins"
        initialSort={{ key: "amount_php", direction: "desc" }}
        rows={payload.twins}
        columns={[
          {
            key: "title",
            label: "Title",
            scope: "row",
            render: (r) => (
              <span className="cell-main">
                {r.title}
                <small>
                  {regionName(r.region)} · House PDF p.{r.house_pdf_page ?? "—"}
                </small>
              </span>
            ),
          },
          {
            key: "house_program",
            label: "House side",
            render: (r) => (
              <span className="cell-main">
                {r.house_program}
                <small>
                  {r.house_pap_id} · {r.house}
                </small>
              </span>
            ),
          },
          {
            key: "nep_program",
            label: "NEP side",
            render: (r) => (
              <span className="cell-main">
                {r.nep_program ?? "—"}
                <small>
                  {r.nep_pap_id ?? "—"} · {r.nep}
                </small>
              </span>
            ),
          },
          {
            key: "amount_php",
            label: "Equal amount",
            align: "num",
            render: (r) => <Money value={r.amount_php} />,
          },
          {
            key: "drill",
            label: "Open",
            sortable: false,
            width: "1%",
            render: (r) =>
              r.shell ? <OpenShell label={r.shell} onOpen={onOpenShell} /> : "—",
          },
        ]}
        empty="No twin pairs."
      />
      <p className="muted">
        Same normalized title, region, zone and equal amount, sitting unmatched
        on both sides under different program sections. Cross-referenced, never
        auto-paired: amount alone must not certify identity.
      </p>
    </>
  );
}

export function OverlapsTab({ index, payload, onOpenShell }) {
  // Hook before the early return: `payload` arrives asynchronously, so calling
  // useMemo after the `if (!payload)` guard would change the hook count
  // between renders.
  //
  // Bars belong on the spectrum, where pair counts vary widely (37 → 169).
  // The low-overlap list below is all exactly 0%, where a bar would be pure
  // noise — that list shows the withheld delta instead.
  const scales = useMemo(
    () => barScale((index.overlap_spectrum ?? []).map((b) => b.pairs)),
    [index],
  );
  if (!payload) return <Loading>Loading overlap spectrum…</Loading>;
  const low = payload.pairs.filter((p) => p.overlap_ratio <= 0.05);
  const withheld = low.filter((p) => p.overlap_ratio === 0);
  return (
    <>
      <h3>Overlaps · measured station-span overlap of attached pairs</h3>
      <p className="rv-note">{payload.note}</p>
      <SortableTable
        tableId="relations-overlaps-spectrum"
        ariaLabel="Overlap spectrum"
        // key:null keeps the builder's ascending band order on first paint.
        // Passing `false` would NOT do this: SortableTable falls back to
        // sorting by the first sortable column, which would reverse the bands
        // alphabetically. Clicking a header still re-sorts on demand.
        initialSort={{ key: null }}
        rows={index.overlap_spectrum.map((b, i) => ({ ...b, id: b.bucket, _w: scales.get(i) ?? 0 }))}
        columns={[
          { key: "bucket", label: "Overlap band", scope: "row" },
          {
            key: "pairs",
            label: "Pairs",
            align: "num",
            render: (r) => (
              <span className="rv-bar-cell">
                <span className="rv-bar" style={{ width: "86px" }}>
                  <span style={{ width: `${r._w}%` }} />
                </span>
                <small>{r.pairs.toLocaleString()}</small>
              </span>
            ),
          },
          {
            key: "gross_abs_delta_php",
            label: "Gross |Δ|",
            align: "num",
            render: (r) => <Money value={r.gross_abs_delta_php} />,
          },
          {
            key: "net_delta_php",
            label: "Net Δ",
            align: "num",
            render: (r) => (
              <Money
                value={r.net_delta_php}
                tone={(r.net_delta_php ?? 0) < 0 ? "neg" : (r.net_delta_php ?? 0) > 0 ? "pos" : ""}
              />
            ),
          },
        ]}
        empty="No measured pairs."
      />
      <h4>
        Zero and low-overlap pairs ({low.length.toLocaleString()})
        {withheld.length > 0 && ` · ${withheld.length.toLocaleString()} at exactly zero`}
      </h4>
      <p className="muted">
        Disjoint or barely-touching segments of the same road. Delta is booked
        only for pairs above zero overlap; these are attached for scope review,
        so the amount difference below is deliberately excluded from adjustment
        totals.
      </p>
      <SortableTable
        tableId="relations-overlaps-low"
        ariaLabel="Zero and low-overlap pairs"
        initialSort={{ key: "overlap_ratio", direction: "asc" }}
        pageSize={PAGE}
        rows={low}
        columns={[
          {
            key: "title",
            label: "Pair",
            scope: "row",
            render: (r) => (
              <span className="cell-main">
                {r.title}
                <small>
                  {regionName(r.region)} · {bucketFor(index, r.overlap_ratio)}
                </small>
              </span>
            ),
          },
          {
            key: "overlap_ratio",
            label: "Overlap",
            align: "num",
            render: (r) =>
              r.overlap_ratio === 0 ? (
                <span className="rv-tag rv-tag--warn">disjoint</span>
              ) : (
                `${(r.overlap_ratio * 100).toFixed(1)}%`
              ),
          },
          {
            key: "house_amount_php",
            label: "HGAB",
            align: "num",
            render: (r) => <Money value={r.house_amount_php} />,
          },
          {
            key: "nep_amount_php",
            label: "NEP",
            align: "num",
            render: (r) => <Money value={r.nep_amount_php} />,
          },
          {
            key: "delta_php",
            label: "Δ withheld",
            align: "num",
            render: (r) => (
              <Money
                value={r.delta_php}
                tone={(r.delta_php ?? 0) < 0 ? "neg" : (r.delta_php ?? 0) > 0 ? "pos" : ""}
              />
            ),
          },
          {
            key: "drill",
            label: "Open",
            sortable: false,
            width: "1%",
            render: (r) =>
              r.shell ? <OpenShell label={r.shell} onOpen={onOpenShell} /> : "—",
          },
        ]}
        empty="No zero/low-overlap pairs."
      />
    </>
  );
}

export function ShellModal({ label, shellsPayload, statesPayload, onClose }) {
  const dialog = useRef(null);
  // Return openModalDialog's closer, same contract as GroupProjectsModal: it
  // decrements the shared dialog counter and restores body scrolling. Both
  // branches below render one <dialog> without an `open` attribute, because
  // showModal() throws InvalidStateError on an already-open element.
  useEffect(() => openModalDialog(dialog.current), []);
  const entry = shellsPayload.shells[label];
  const overlay = useMemo(
    () => decodeStateOverlay(statesPayload),
    [statesPayload],
  );
  const rows = useMemo(
    () =>
      entry
        ? shellRows(entry, shellsPayload.nodes, overlay, shellsPayload.edges)
        : [],
    [entry, shellsPayload, overlay],
  );
  const ledger = useMemo(() => shellLedger(rows), [rows]);

  if (!entry)
    return (
      <dialog
        ref={dialog}
        className="analytics-dialog"
        aria-labelledby="shell-not-found-title"
        onCancel={(e) => { e.preventDefault(); onClose(); }}
      >
        <header className="analytics-header">
          <div className="analytics-heading">
            <div>
              <p className="eyebrow">SHELL RELATIONS</p>
              <h2 id="shell-not-found-title">Shell not found</h2>
            </div>
            <button onClick={onClose} autoFocus aria-label="Close">Close</button>
          </div>
          <p className="muted">
            No roster entry matches this link — the shell key changes when the
            comparison is rebuilt. Close and reopen from a finding.
          </p>
        </header>
      </dialog>
    );

  const unsupplied = unsuppliedRows(rows);
  const gap = entry.amount_gap_php ?? 0;
  const stateCounts = rows.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <dialog
      ref={dialog}
      className="analytics-dialog"
      aria-labelledby="shell-relations-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // Clicking the backdrop closes, matching the other analytics modals.
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const b = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < b.left || e.clientX > b.right ||
          e.clientY < b.top || e.clientY > b.bottom
        ) onClose();
      }}
    >
      <header className="analytics-header">
        <div className="analytics-heading">
          <div>
            <p className="eyebrow">SHELL RELATIONS</p>
            <h2 id="shell-relations-title">{entry.title || label}</h2>
          </div>
          <button onClick={onClose} autoFocus aria-label="Close shell relations">Close</button>
        </div>
        <p>
          {regionName(entry.region)} · {entry.kind === "road" ? "road corridor" : "place shell"} ·{" "}
          {rows.length.toLocaleString()} member rows · {entry.edges} edges
        </p>
        <div className="analytics-filter-tags" aria-label="States present in this shell">
          {Object.entries(stateCounts).map(([state, n]) => (
            <span key={state}>
              {stateLabel(state)} · {n.toLocaleString()}
            </span>
          ))}
        </div>
      </header>
      {/* The dialog is a fixed-height flex box with overflow:hidden, so the
          body MUST live inside .analytics-content to be scrollable. */}
      <div className="analytics-content">
        <div className="analytics-summary-cards">
          <article>
            <h3>House (HGAB) total</h3>
            <strong>{amount(entry.house_amount_php)}</strong>
            <p>
              {ledger.house.count.toLocaleString()} rows
              {ledger.house.unsupplied > 0 && ` · ${ledger.house.unsupplied.toLocaleString()} unsupplied`}
            </p>
          </article>
          <article>
            <h3>NEP total</h3>
            <strong>{amount(entry.nep_amount_php)}</strong>
            <p>
              {ledger.nep.count.toLocaleString()} rows
              {ledger.nep.unsupplied > 0 && ` · ${ledger.nep.unsupplied.toLocaleString()} unsupplied`}
            </p>
          </article>
          <article className={gap !== 0 ? "is-gap" : undefined}>
            <h3>Gap (House − NEP)</h3>
            <strong>{amount(gap)}</strong>
            <p>
              {gap === 0
                ? "Sides agree. No attached pair explains a difference because there is none."
                : "No attached pair explains this gap — see the unsupplied rows below."}
            </p>
          </article>
        </div>
        {(ledger.house.missingBodies > 0 || ledger.nep.missingBodies > 0) && (
          <p className="rv-unsupplied-note">
            {ledger.house.missingBodies + ledger.nep.missingBodies} member row(s)
            are listed by the roster but carry no body in the sidecar, so they
            count toward membership but contribute nothing to the totals above.
            The totals shown are the roster's own figures.
          </p>
        )}
        <div className="rv-ledger">
          {(["house", "nep"]).map((side) => {
            const l = ledger[side];
            return (
              <section className="rv-ledger-side" key={side}>
                <h4>{side === "house" ? "House (HGAB)" : "NEP"} · {l.count.toLocaleString()} rows</h4>
                <dl>
                  <dt>Total</dt>
                  <dd>{amount(l.total)}</dd>
                  <dt>Unsupplied</dt>
                  <dd>{l.unsupplied.toLocaleString()}</dd>
                  <dt>Committed</dt>
                  <dd>
                    {l.rows.filter((r) => r.state === "committed_attached").length.toLocaleString()}
                  </dd>
                  <dt>Review-only</dt>
                  <dd>
                    {l.rows.filter((r) => r.state === "review_attached").length.toLocaleString()}
                  </dd>
                </dl>
              </section>
            );
          })}
        </div>
        {unsupplied.length > 0 && (
          <p className="rv-unsupplied-note">
            {unsupplied.length.toLocaleString()} of {rows.length.toLocaleString()} member
            rows are <strong>unsupplied</strong> — present in this shell but
            never consumed by a committed or review-only attachment. These are
            exactly the rows an <em>unsupplied shell</em> finding names.
          </p>
        )}
        <SortableTable
          tableId={`relations-shell-${label.slice(-6)}`}
          ariaLabel="Rows of this shell with their states"
          // key:null preserves shellRows' own order — house side first, then
          // confidence-ladder rank, then amount. `false` would instead sort by
          // the first sortable column (Row title), scrambling that reading
          // order. Clicking a header still re-sorts on demand.
          initialSort={{ key: null }}
          rows={rows}
          columns={[
            {
              key: "node",
              label: "Row",
              scope: "row",
              value: (r) => r.node?.title ?? r.id,
              render: (r) => (
                <span className="cell-main">
                  {r.node?.title ?? r.id}
                  <small>
                    <span className={`rv-tag${r.side === "house" ? "" : " rv-tag--withheld"}`}>
                      {r.side === "house" ? "HGAB" : "NEP"}
                    </span>{" "}
                    {r.id}
                  </small>
                </span>
              ),
            },
            {
              key: "state",
              label: "State",
              value: (r) => r.state,
              render: (r) => <StatePill state={r.state} />,
            },
            {
              key: "amount",
              label: "Amount",
              align: "num",
              value: (r) => r.node?.amount_php ?? null,
              render: (r) => <Money value={r.node?.amount_php} />,
            },
            {
              key: "matcherStatus",
              label: "Matcher status",
              value: (r) => r.matcherStatus ?? "",
              render: (r) =>
                r.matcherStatus ? (
                  <span className="rv-tag">{r.matcherStatus.replaceAll("_", " ")}</span>
                ) : (
                  "—"
                ),
            },
            {
              key: "edges",
              label: "Edges",
              align: "num",
              value: (r) => r.edges.length,
              render: (r) =>
                r.edges.length ? (
                  <span className="rv-edges">
                    {r.edges.map((e, i) => (
                      <span key={`${e.kind}-${e.house}-${e.nep}-${i}`} className={`rv-edge-kind rv-edge-kind--${e.kind}`}>
                        {e.kind}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
          empty="No rows."
        />
      </div>
    </dialog>
  );
}

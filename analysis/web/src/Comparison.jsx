import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { loadData, sourceReference, siteUrl } from "./data.js";
import { amount, metric, selectRows, values } from "./model.js";
const PdfPreview = lazy(() => import("./PdfPreview.jsx"));
const names = ["DPWH Transparency NEP", "Official NEP", "House"];
const label = (value) => (value ?? "").replaceAll("_", " ");
export default function Comparison() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("paps"),
    [query, setQuery] = useState(""),
    [program, setProgram] = useState(""),
    [region, setRegion] = useState(""),
    [trace, setTrace] = useState(""),
    [column, setColumn] = useState("title"),
    [mode, setMode] = useState("total"),
    [direction, setDirection] = useState(1),
    [page, setPage] = useState(0),
    [source, setSource] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    loadData("stage_trace_2027.json", c.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  const rows = data
    ? tab === "paps"
      ? data.paps
      : tab === "gaps"
        ? data.transparency_gaps
        : data.projects
    : [];
  const filtered = useMemo(
    () =>
      tab === "gaps"
        ? rows
            .filter(
              (r) =>
                (!query ||
                  JSON.stringify(r)
                    .toLowerCase()
                    .includes(query.toLowerCase())) &&
                (!program || r.program === program) &&
                (!region || r.region === region),
            )
            .sort((a, b) => a.title.localeCompare(b.title))
        : selectRows(rows, {
            query,
            program,
            region,
            trace,
            column,
            mode,
            direction,
            tab,
          }),
    [rows, query, program, region, trace, column, mode, direction, tab],
  );
  useEffect(
    () => setPage(0),
    [query, program, region, trace, column, mode, direction, tab],
  );
  const changeTab = (t) => {
    setTab(t);
    setQuery("");
    setProgram("");
    setRegion("");
    setTrace("");
    setColumn("title");
    setMode("total");
    setPage(0);
  };
  const open = (kind, p, title) => {
    const reference = sourceReference(kind, p, title);
    if (reference) setSource(reference);
  };
  const sourceButtons = (kind, pages, title) =>
    (pages ?? []).filter(Number.isInteger).map((p) => (
      <button
        className="source-link"
        key={kind + p}
        onClick={() => open(kind, p, title)}
      >
        {kind === "house" ? "House" : "NEP"} p.{p}
      </button>
    ));
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <a href={siteUrl("analysis/stage_trace_2027.html")}>
          Open retained comparison
        </a>
      </p>
    );
  if (!data) return <p role="status">Loading retained comparison data…</p>;
  const stages = data.summary.stages;
  return (
    <>
      <h1>Compare budget stages</h1>
      <p className="notice">
        Candidate matches do not certify additions, removals, or final
        amendments. Source totals and extraction coverage describe different
        scopes.
      </p>
      <div className="cards">
        <article>
          <h3>{names[0]}</h3>
          <strong>{amount(stages.transparency_nep.php)}</strong>
          <p>Retained project listing</p>
        </article>
        <article>
          <h3>{names[1]}</h3>
          <strong>{amount(stages.official_nep.operations_php)}</strong>
          <p>
            Operations · full{" "}
            {amount(stages.official_nep.new_appropriations_php)}
          </p>
        </article>
        <article>
          <h3>{names[2]}</h3>
          <strong>{amount(stages.house.extracted_php)}</strong>
          <p>
            Extracted allocations · printed{" "}
            {amount(stages.house.printed_new_appropriations_php)}
          </p>
        </article>
      </div>
      <nav className="view-tabs" aria-label="Comparison tables">
        {[
          ["paps", "PAP totals"],
          ["projects", "Project records"],
          ["gaps", "Missing from listing"],
        ].map(([key, name]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => changeTab(key)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="filters">
        <label>
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, source ID, or office"
          />
        </label>
        <Filter
          label="Program"
          rows={rows}
          field="program"
          value={program}
          set={setProgram}
        />
        {tab !== "paps" && (
          <Filter
            label="Region"
            rows={rows}
            field="region"
            value={region}
            set={setRegion}
          />
        )}{" "}
        {tab === "projects" && (
          <Filter
            label="Match status"
            rows={rows}
            field="trace"
            value={trace}
            set={setTrace}
          />
        )}{" "}
        {tab !== "gaps" && (
          <>
            <label>
              Sort column
              <select
                aria-label="Sort column"
                value={column}
                onChange={(e) => {
                  setColumn(e.target.value);
                  if (e.target.value === "0") setMode("total");
                }}
              >
                <option value="title">Title</option>
                {names.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort amount by
              <select
                aria-label="Sort amount by"
                value={mode}
                disabled={column === "title" || column === "0"}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="total">Total</option>
                <option value="delta">Delta vs previous</option>
                <option value="percent">Percent change</option>
              </select>
            </label>
            <button onClick={() => setDirection((d) => -d)}>
              {direction === 1 ? "Ascending ↑" : "Descending ↓"}
            </button>
          </>
        )}
      </div>
      <p className="muted" aria-live="polite">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
        rows. Unknown amounts and unpaired deltas stay last. Amounts: PHP; B
        billion, M million, K thousands.
      </p>
      <div
        className="table-scroll"
        tabIndex="0"
        role="region"
        aria-label="Comparison results"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">{tab === "paps" ? "PAP" : "Project"}</th>
              {tab === "gaps" ? (
                <>
                  <th scope="col">Amount</th>
                  <th scope="col">Region</th>
                </>
              ) : (
                names.map((n) => (
                  <th scope="col" key={n}>
                    {n}
                  </th>
                ))
              )}
              <th scope="col">Source evidence</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 50, page * 50 + 50).map((r, i) => (
              <tr key={r.id ?? r.source_id ?? `${page}-${i}`}>
                <th scope="row">
                  {r.label ?? r.title}
                  <small>
                    {r.program} · {r.region ?? ""}
                  </small>
                  {tab === "projects" && (
                    <small>
                      {label(r.trace)} · {r.nep?.id ?? r.house?.id ?? r.api?.id}
                    </small>
                  )}
                </th>
                {tab === "gaps" ? (
                  <>
                    <td className="num">{amount(r.amount_php)}</td>
                    <td>{r.region}</td>
                  </>
                ) : (
                  values(r, tab).map((value, index) => (
                    <Money
                      key={index}
                      value={value}
                      prior={values(r, tab)[index - 1]}
                    />
                  ))
                )}
                <td>
                  {tab === "paps" ? (
                    <>
                      {sourceButtons("nep", [r.nep_page], r.label)}
                      {sourceButtons("house", r.house_pages, r.label)}
                    </>
                  ) : tab === "gaps" ? (
                    sourceButtons("nep", [r.pdf_page], r.title)
                  ) : (
                    <>
                      {sourceButtons("nep", [r.nep?.pdf_page], r.title)}
                      {sourceButtons("house", [r.house?.pdf_page], r.title)}
                      {!r.nep?.pdf_page && !r.house?.pdf_page && (
                        <small>No PDF page recorded</small>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p>No rows match these filters.</p>}
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {filtered.length
            ? `${page * 50 + 1}–${Math.min((page + 1) * 50, filtered.length)}`
            : "0"}{" "}
          / {filtered.length.toLocaleString()}
        </span>
        <button
          disabled={(page + 1) * 50 >= filtered.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
        <a href={siteUrl("analysis/stage_trace_2027.json")} download>
          Download retained JSON
        </a>
      </div>
      {source && (
        <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
          <PdfPreview source={source} onClose={() => setSource(null)} />
        </Suspense>
      )}
    </>
  );
}
function Filter({ label: caption, rows, field, value, set }) {
  return (
    <label>
      {caption}
      <select
        aria-label={caption}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">All</option>
        {[...new Set(rows.map((r) => r[field]).filter(Boolean))]
          .sort()
          .map((v) => (
            <option key={v} value={v}>
              {label(v)}
            </option>
          ))}
      </select>
    </label>
  );
}
function Money({ value, prior }) {
  const delta = metric(value, prior, "delta"),
    percent = metric(value, prior, "percent");
  return (
    <td
      className="num"
      title={
        value == null
          ? "No amount recorded"
          : `${value.toLocaleString("en-PH")} PHP`
      }
    >
      <strong>{amount(value)}</strong>
      {delta != null && (
        <small className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>
          Δ {delta > 0 ? "+" : ""}
          {amount(delta)} (
          {percent == null
            ? "n/a"
            : `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`}
          )
        </small>
      )}
    </td>
  );
}

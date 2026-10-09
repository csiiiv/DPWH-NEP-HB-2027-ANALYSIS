import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadData, sourceReference, siteUrl, repo } from "./data.js";
import { amount, metric, selectRows, values, officeOptions, officeLabels } from "./model.js";
import ShareLink from "./ShareLink.jsx";
import {useComparisonFinding} from "./useComparisonFinding.js";
const PdfPreview = lazy(() => import("./PdfPreview.jsx"));
const names = ["DPWH Transparency NEP", "DBM NEP", "House GAB"];
const label = (value) => (value ?? "").replaceAll("_", " ");
export default function Comparison({ route }) {
  const [data, setData] = useState(null),
    [readings, setReadings] = useState(null),
    [error, setError] = useState(""),
    [source, setSource] = useState(null),
    [panel, setPanel] = useState("table"),
    [menu, setMenu] = useState(null);
  const [finding,setFinding] = useComparisonFinding(route);
  const {tab,query,program,region,office,trace,column,mode,direction,page} = finding;
  const setTab=v=>setFinding('tab',v), setQuery=v=>setFinding('query',v), setProgram=v=>setFinding('program',v),
    setRegion=v=>setFinding('region',v), setOffice=v=>setFinding('office',v), setTrace=v=>setFinding('trace',v),
    setColumn=v=>setFinding('column',v), setMode=v=>setFinding('mode',v), setDirection=v=>setFinding('direction',v), setPage=v=>setFinding('page',v);
  useEffect(()=>{setSource(null);setPanel('table');setMenu(null);},[route]);
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    if (menu) menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([loadData("stage_trace_2027.json", c.signal), loadData("house_reading_changes_2027.json", c.signal)])
      .then(([stages, readings]) => { setData(stages); setReadings(readings); })
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
        : tab === "readings" ? readings.projects : data.projects
    : [];
  const filtered = useMemo(
    () =>
      selectRows(rows, {
        query,
        program,
        region,
        office,
        trace,
        column,
        mode,
        direction,
        tab,
      }),
    [rows, query, program, region, office, trace, column, mode, direction, tab],
  );
  useEffect(()=>{
    if (data && readings && page > Math.max(0,Math.ceil(filtered.length/50)-1)) setPage(Math.max(0,Math.ceil(filtered.length/50)-1));
  },[data,readings,filtered.length,page]);
  useEffect(() => {
    if (!menu) return;
    const outside = (e) => {
      if (!e.target.closest(".sort-menu,.sort-header")) setMenu(null);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        menu.button?.focus();
        setMenu(null);
      }
    };
    const scroll = () => setMenu(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("wheel", scroll, { passive: true });
    window.addEventListener("touchmove", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("wheel", scroll);
      window.removeEventListener("touchmove", scroll);
      window.removeEventListener("resize", scroll);
    };
  }, [menu]);
  const sort = (key, nextMode = "total") => {
    setDirection(column === key && mode === nextMode ? -direction : 1);
    setColumn(key);
    setMode(nextMode);
    menu?.button?.focus();
    setMenu(null);
  };
  const header = (name, key, isAmount = false) => (
    <th
      scope="col"
      aria-sort={
        column === key ? (direction === 1 ? "ascending" : "descending") : "none"
      }
    >
      <button
        className="sort-header"
        aria-label={`Sort by ${name}`}
        aria-haspopup={isAmount ? "menu" : undefined}
        aria-expanded={isAmount ? menu?.column === key : undefined}
        onClick={(e) => {
          if (!isAmount) {
            sort(key);
            return;
          }
          if (menu?.column === key) {
            setMenu(null);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({
            button: e.currentTarget,
            column: key,
            name,
            left: Math.max(8, Math.min(innerWidth - 240, rect.left)),
            top: Math.max(8, Math.min(innerHeight - 190, rect.bottom + 6)),
          });
        }}
      >
        {name}
        <span className="sort-indicator" aria-hidden="true">
          {column === key
            ? `${mode !== "total" ? (mode === "delta" ? " Δ" : " %") : ""} ${direction === 1 ? "↑" : "↓"}`
            : " ↕"}
        </span>
      </button>
    </th>
  );
  const changeTab = (t) => {
    setTab(t);
    setMenu(null);
    setQuery("");
    setProgram("");
    setRegion("");
    setOffice("");
    setTrace(t === "readings" ? "reading_changed" : "");
    setColumn("title");
    setMode("total");
    setPage(0);
  };
  const open = (kind, p, title) => {
    const reference = sourceReference(kind, p, title);
    if (reference) {
      setSource(reference);
      setPanel("pdf");
    }
  };
  const sourceButtons = (kind, pages, title) =>
    (pages ?? []).filter(Number.isInteger).map((p) => (
      <button
        className="source-link"
        aria-pressed={
          source?.page === p &&
          source?.document === sourceReference(kind, p, title)?.document
        }
        key={kind + p}
        onClick={() => open(kind, p, title)}
      >
        {sourceReference(kind, p, title)?.pageLabel} p.{p}
      </button>
    ));
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <a href={repo + "analysis/data/stage_trace_2027.json"}>
          Inspect retained comparison data
        </a>
      </p>
    );
  if (!data) return <p role="status">Loading retained comparison data…</p>;
  const maxPage=Math.max(0,Math.ceil(filtered.length/50)-1);
  const visiblePage=Math.min(page,maxPage);
  const stages = data.summary.stages;
  const tableNames = tab === "readings" ? ["House 2nd reading", "House 3rd reading"] : names;
  return (
    <>
      <div className="comparison-heading">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>Compare budget stages</h1>
      </div>
      <p className="notice comparison-notice">
        Candidate matches do not certify additions, removals, or final
        amendments. Source totals and extraction coverage describe different
        scopes.
      </p>
      <p className="muted">House allocations and titles use native Volume I-C; v5 is retired.
        {" "}<a href="#house-nep">Inspect extraction controls and allocation candidates →</a>
      </p>
      <div className="cards stage-totals">
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
            2nd reading operations · agency total{" "}
            {amount(stages.house.printed_new_appropriations_php)}
          </p>
        </article>
        <article>
          <h3>House 3rd reading</h3>
          <strong>{amount(readings.summary.third.operations_including_projects)}</strong>
          <p>Operations · agency total {amount(readings.summary.third.new_appropriations)}</p>
          <p>3rd − 2nd operations: {readings.summary.allocation_delta_php > 0 ? "+" : ""}{amount(readings.summary.allocation_delta_php)}</p>
        </article>
      </div>
      <ShareLink />
      <nav className="view-tabs" aria-label="Comparison tables">
        {[
          ["paps", "PAP totals"],
          ["projects", "Project records"],
          ["readings", "House readings"],
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
      {tab === "readings" && <section className="notice" aria-label="House reading changes">
        <p>2nd → 3rd reading. Differences are 3rd minus 2nd. Agency total: {amount(readings.summary.control_deltas_php.new_appropriations)};
          {" "}Operations: {amount(readings.summary.control_deltas_php.operations_including_projects)};
          {" "}Support to Operations: {amount(readings.summary.control_deltas_php.s2o_total)}.</p>
        <p>{readings.summary.status_counts.third_only ?? 0} records appear only in the 3rd reading.
          {" "}Repeated keys are grouped; source absence counts as zero for ledger differences and does not establish project identity.</p>
        <a href={siteUrl("analysis/house_reading_changes_2027.json")} download>Download both readings and differences</a>
        <p><a href={siteUrl("analysis/hb_dpwh_native_ic_projects.json")} download>2nd reading native I-C</a>
          {" · "}<a href={siteUrl("analysis/hb_dpwh_native_ic_projects_3rd_reading.json")} download>3rd reading native I-C</a></p>
        <div className="table-scroll" tabIndex="0" role="region" aria-label="House reading control differences">
          <table><thead><tr><th>Scope</th><th>2nd reading</th><th>3rd reading</th><th>3rd − 2nd</th></tr></thead>
            <tbody>{[["Agency total", "new_appropriations"], ["Support to Operations", "s2o_total"], ["Operations incl. local/FAP", "operations_including_projects"]].map(([name, key]) =>
              <tr key={key}><th scope="row">{name}</th><td>{amount(readings.summary.second[key])}</td><td>{amount(readings.summary.third[key])}</td><td>{amount(readings.summary.control_deltas_php[key])}</td></tr>)}</tbody>
          </table>
        </div>
      </section>}
      {tab === "projects" && <p className="notice">These House/NEP project comparisons use the 2nd reading. <a href="#house?view=projects&reading=third">Search the 3rd-reading House project tree</a> or <a href="#compare?view=readings">compare both House readings</a>.</p>}
      {tab === "paps" && <p className="muted">PAP totals include the separate Foreign-assisted projects (FAP) control and reconcile to operations. FAP is outside the Transparency listing scope; its Transparency amount is unavailable.</p>}
      <div className="workspace-switch" aria-label="Workspace panels">
        <button
          aria-pressed={panel === "table"}
          onClick={() => setPanel("table")}
        >
          Table
        </button>
        <button aria-pressed={panel === "pdf"} onClick={() => setPanel("pdf")}>
          PDF source
        </button>
      </div>
      <div className={`comparison-workspace ${panel}-active`}>
        <section className="comparison-table" aria-label="Comparison table">
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
              set={(value) => { setProgram(value); setOffice(""); }}
            />
            {tab !== "paps" && (
              <Filter
                label="Region"
                rows={rows}
                field="region"
                value={region}
                set={(value) => { setRegion(value); setOffice(""); }}
              />
            )}{" "}
            {tab !== "paps" && (
              <label>
                Engineering office / DEO
                <select aria-label="Engineering office / DEO" value={office} onChange={(e) => setOffice(e.target.value)}>
                  <option value="">All offices</option>
                  {office && !officeOptions(rows.filter(r => (!program || r.program === program) && (!region || r.region === region)), region).some(o=>o.value===office) && <option value={office}>Unavailable office: {office}</option>}
                  {officeOptions(rows.filter(r => (!program || r.program === program) && (!region || r.region === region)), region).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            )}
            {tab === "readings" ? <label>Match status
              <select aria-label="Match status" value={trace} onChange={e => setTrace(e.target.value)}>
                {[["", "All records"], ["reading_changed", "Changed allocations"], ["third_only", "3rd reading only"], ["second_only", "2nd reading only"], ["amount_changed", "Paired amount changes"], ["repeated_key", "Repeated keys / grouped"], ["same_amount", "Same amount"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label> : tab === "projects" && (
              <Filter
                label="Match status"
                rows={rows}
                field="trace"
                value={trace}
                set={setTrace}
              />
            )}{" "}
          </div>
          {tab !== "paps" && <p className="muted">Office filters use recorded source assignments. Paired sources may list different offices; fuzzy suggestions are excluded.</p>}
          <p className="result-count" aria-live="polite">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
            rows · Click a header to sort. Amounts in PHP · total / Δ / %.
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
                  {header(tab === "paps" ? "PAP" : "Project", "title")}
                  {tab === "gaps" ? (
                    <>
                      {header("Amount", "amount", true)}
                      {header("Region", "region")}
                      {header("PDF page", "pdf_page")}
                    </>
                  ) : (
                    <>
                      {tableNames.map((n, i) => (
                        <React.Fragment key={n}>
                          {header(n, String(i), true)}
                        </React.Fragment>
                      ))}
                      {tab === "readings" && header("3rd − 2nd", "reading_delta")}
                      <th scope="col">Source evidence</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(visiblePage * 50, visiblePage * 50 + 50).map((r, i) => (
                  <tr key={r.id ?? r.source_id ?? `${page}-${i}`}>
                    <th scope="row">
                      {r.label ?? r.title}
                      <small>
                        {r.program} · {r.region ?? ""}
                      </small>
                      {(tab === "projects" || tab === "readings") && (
                        <small>
                          {label(r.trace)} ·{" "}
                          {tab === "readings" ? r.match_basis : r.nep?.id ?? r.house?.id ?? r.api?.id}
                        </small>
                      )}
                      {tab !== "paps" && (officeLabels(r).length
                        ? officeLabels(r).map(text => <small key={text}>{text}</small>)
                        : <small>No recorded office</small>)}
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
                    {tab === "readings" && <td className={`num ${r.delta_php > 0 ? "up" : r.delta_php < 0 ? "down" : ""}`}>
                      {r.delta_php > 0 ? "+" : ""}{amount(r.delta_php)}
                    </td>}
                    <td>
                      {tab === "paps" ? (
                        <>
                          {sourceButtons("nep", [r.nep_page], r.label)}
                          {sourceButtons("house", r.house_pages, r.label)}
                        </>
                      ) : tab === "gaps" ? (
                        sourceButtons("nep", [r.pdf_page], r.title)
                      ) : tab === "readings" ? (
                        <>
                          {sourceButtons("house-second", r.second?.pdf_pages, r.title)}
                          {sourceButtons("house-third", r.third?.pdf_pages, r.title)}
                        </>
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
            <button disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>
              Previous
            </button>
            <span>
              {filtered.length
                ? `${visiblePage * 50 + 1}–${Math.min((visiblePage + 1) * 50, filtered.length)}`
                : "0"}{" "}
              / {filtered.length.toLocaleString()}
            </span>
            <button
              disabled={(visiblePage + 1) * 50 >= filtered.length}
              onClick={() => setPage(visiblePage + 1)}
            >
              Next
            </button>
            <a href={siteUrl("analysis/stage_trace_2027.json")} download>
              Download retained JSON
            </a>
          </div>
        </section>
        <aside className="source-pane" aria-label="PDF source pane">
          {source ? (
            <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
              <PdfPreview
                source={source}
                onClose={() => {
                  setSource(null);
                  setPanel("table");
                }}
              />
            </Suspense>
          ) : (
            <div className="pdf-empty">
              <h2>Source PDF</h2>
              <p>Select a NEP or House page in the table to inspect it here.</p>
            </div>
          )}
        </aside>
      </div>
      {menu && (
        <div
          className="sort-menu"
          ref={menuRef}
          role="menu"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll("button")];
            const index = items.indexOf(document.activeElement);
            items[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length
            ]?.focus();
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setMenu(null);
          }}
          aria-label={`Sort ${menu.name}`}
          style={{ left: menu.left, top: menu.top }}
        >
          <strong>{menu.name}</strong>
          {[
            ["total", "Total value"],
            ["delta", "Delta vs previous"],
            ["percent", "Percent change"],
          ]
            .filter(
              ([m]) => m === "total" || (menu.column !== "0" && tab !== "gaps"),
            )
            .map(([m, text]) => (
              <button
                key={m}
                role="menuitemradio"
                aria-checked={column === menu.column && mode === m}
                onClick={() => sort(menu.column, m)}
              >
                {text}
                {column === menu.column && mode === m
                  ? direction === 1
                    ? " ↑"
                    : " ↓"
                  : ""}
              </button>
            ))}
          <small>Select again to reverse direction.</small>
        </div>
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
        {value && !rows.some(r=>r[field]===value) && <option value={value}>Unavailable: {label(value)}</option>}
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

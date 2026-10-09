import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadData, sourceReference, siteUrl, repo } from "./data.js";
import { amount, metric, selectRows, values } from "./model.js";
const PdfPreview = lazy(() => import("./PdfPreview.jsx"));
const names = ["DPWH Transparency NEP", "DBM NEP", "House GAB"];
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
    [source, setSource] = useState(null),
    [panel, setPanel] = useState("table"),
    [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    if (menu) menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [menu]);
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
      selectRows(rows, {
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
    setTrace("");
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
          source?.document ===
            (kind === "house" ? "House GAB · Volume I-C" : "DBM NEP · Volume II-B")
        }
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
        <a href={repo + "analysis/data/stage_trace_2027.json"}>
          Inspect retained comparison data
        </a>
      </p>
    );
  if (!data) return <p role="status">Loading retained comparison data…</p>;
  const stages = data.summary.stages;
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
          </div>
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
                      {names.map((n, i) => (
                        <React.Fragment key={n}>
                          {header(n, String(i), true)}
                        </React.Fragment>
                      ))}
                      <th scope="col">Source evidence</th>
                    </>
                  )}
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
                          {label(r.trace)} ·{" "}
                          {r.nep?.id ?? r.house?.id ?? r.api?.id}
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

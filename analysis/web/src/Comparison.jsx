import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadData, sourceReference, siteUrl, repo } from "./data.js";
import { amount, metric, selectRows, values, officeOptions, warmSearchIndex, matchesProgram, programLabel } from "./model.js";
import {suggestedCounterparts} from "./suggestedCounterparts.js";
import {regionCandidates} from "./regionCandidates.js";
import {officeAssignments} from "../../viewers/project_offices.mjs";
import {readingInfo,matchInfo} from "./analyticsStatusInfo.js";
import {
  FLAG_OPTIONS,
  MATCH_STATUS_INFO,
  MATCH_STATUS_OPTIONS,
  flagLabel,
  identityMatchStatus,
  matchStatusLabel,
} from "./matchFilters.js";
import {hydrateProjects} from "./comparisonData.js";
import {downloadResults} from "./comparisonExport.js";
import {useDebouncedSearch} from "./useDebouncedSearch.js";
import ShareLink from "./ShareLink.jsx";
import {useComparisonFinding} from "./useComparisonFinding.js";
import {officeName,regionName} from "./regionNames.js";
import {chainageSideDetail} from "./chainageDisplay.js";
const ProjectAnalytics = lazy(()=>import("./ProjectAnalytics.jsx"));
const ProjectPaths = lazy(()=>import("./ProjectPaths.jsx"));
const PdfPreview = lazy(() => import("./PdfPreview.jsx"));
const names = ["DPWH Transparency NEP", "DBM NEP", "HGAB2 · 2nd reading", "HGAB3 · 3rd reading"];
const label = (value) => (value ?? "").replaceAll("_", " ");
const displayRegion = (value) => regionName(value) || label(value);
const displayOffice = (value) => officeName(value) || label(value);
export default function Comparison({ route }) {
  const [data, setData] = useState(null),
    [readings, setReadings] = useState(null),
    [error, setError] = useState(""),
    [source, setSource] = useState(null),
    [panel, setPanel] = useState("table"),
    [menu, setMenu] = useState(null),
    [analytics,setAnalytics]=useState(null), [projects,setProjects]=useState(null), [moreFilters,setMoreFilters]=useState(false);
  const [finding,setFinding] = useComparisonFinding(route);
  const {tab,query,program,region,office,trace,matchStatus,flag,readingStatus,regionMatching,column,mode,direction,page} = finding;
  const setQuery=v=>setFinding('query',v), setProgram=v=>setFinding('program',v),
    setRegion=v=>setFinding('region',v), setOffice=v=>setFinding('office',v),
    setMatchStatus=v=>setFinding('matchStatus',v), setFlag=v=>setFinding('flag',v),
    setReadingStatus=v=>setFinding('readingStatus',v),
    setColumn=v=>setFinding('column',v), setMode=v=>setFinding('mode',v), setDirection=v=>setFinding('direction',v), setPage=v=>setFinding('page',v);
  const [searchDraft,setSearchDraft]=useDebouncedSearch(query,setQuery,route,tab);
  useEffect(()=>{setSource(null);setPanel('table');setMenu(null);setAnalytics(null);},[route]);
  const menuRef = useRef(null),analyticsButton=useRef(null);
  useLayoutEffect(() => {
    if (menu) menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const c = new AbortController();
    loadData("comparison_overview_2027.json", c.signal)
      .then(overview => { setData(overview); setReadings({summary:overview.readingSummary}); })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  useEffect(()=>{
    if(tab!=='projects' || projects || !data) return;
    const c=new AbortController();
    loadData('comparison_projects_2027.json',c.signal).then(payload=>{
      if(JSON.stringify(payload.input_sha256)!==JSON.stringify(data.input_sha256)) throw new Error('Comparison files belong to different builds. Refresh to load the current version.');
      setProjects(hydrateProjects(payload));
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>c.abort();
  },[tab,projects,data]);
  const unified=useMemo(()=>({paps:data?.paps??[],projects:projects??[]}),[data,projects]);
  const projectRows=useMemo(()=>regionMatching==='ignore' ? regionCandidates(unified.projects) : unified.projects,[unified,regionMatching]);
  const counterpartCounts=useMemo(()=>suggestedCounterparts(projectRows),[projectRows]);
  useEffect(()=>warmSearchIndex(projectRows),[projectRows]);
  const rows = data ? tab === 'paps' ? unified.paps : tab === 'gaps' ? data.transparency_gaps : projectRows : [];
  const offices=useMemo(()=>officeOptions(rows.filter(r=>matchesProgram(r,program) && (!region || officeAssignments(r).some(a=>a.region===region))),region),[rows,program,region]);
  const filtered = useMemo(
    () =>
      selectRows(rows, {
        query,
        program,
        region:tab==='paps' ? '' : region,
        office:tab==='paps' ? '' : office,
        trace:tab==='projects' ? trace : '',
        matchStatus:tab==='projects' ? matchStatus : '',
        flag:tab==='projects' ? flag : '',
        readingStatus:tab==='gaps' ? '' : readingStatus,
        column,
        mode,
        direction,
        tab,
        counterparts:tab==='projects' ? counterpartCounts : null,
      }),
    [rows, query, program, region, office, trace, matchStatus, flag, readingStatus, column, mode, direction, tab, counterpartCounts],
  );
  useEffect(()=>{
    if (data && readings && (tab!=='projects' || projects) && page > Math.max(0,Math.ceil(filtered.length/50)-1)) setPage(Math.max(0,Math.ceil(filtered.length/50)-1));
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
    setFinding('tab',t);
    setMenu(null);
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
  if (error || unified.error)
    return (
      <p role="alert">
        {error || unified.error}{" "}
        <a href={repo + "analysis/data/stage_trace_2027.json"}>
          Inspect retained comparison data
        </a>
      </p>
    );
  if (!data) return <p role="status">Loading retained comparison data…</p>;
  const maxPage=Math.max(0,Math.ceil(filtered.length/50)-1);
  const visiblePage=Math.min(page,maxPage);
  const hasFilters=Boolean(query || program || region || office || matchStatus || flag || trace || readingStatus || regionMatching==='ignore');
  const stages = data.summary.stages;
  const tableNames = names;
  return (
    <>
      <div className="comparison-heading">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>Compare budget stages</h1>
      </div>
      <details className="comparison-context"><summary>Source scopes, reading controls and downloads</summary>
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
          <h3>{names[3]}</h3>
          <strong>{amount(readings.summary.third.operations_including_projects)}</strong>
          <p>Operations · agency total {amount(readings.summary.third.new_appropriations)}</p>
          <p>3rd − 2nd operations: <span className={readings.summary.allocation_delta_php>0?'up':readings.summary.allocation_delta_php<0?'down':''}>{readings.summary.allocation_delta_php > 0 ? "+" : ""}{amount(readings.summary.allocation_delta_php)}</span></p>
        </article>
      </div>
            {tab !== "gaps" && <section className="notice" aria-label="House reading changes">
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
            <tbody>{[["Agency total", "new_appropriations"], ["Support to Operations", "s2o_total"], ["Operations incl. local/FAP", "operations_including_projects"]].map(([name, key]) => {
              const delta=readings.summary.control_deltas_php[key];
              return <tr key={key}><th scope="row">{name}</th><td>{amount(readings.summary.second[key])}</td><td>{amount(readings.summary.third[key])}</td><td className={delta>0?'up':delta<0?'down':''}>{delta > 0 ? "+" : ""}{amount(delta)}</td></tr>;})}</tbody>
          </table>
        </div>
      </section>}
      {tab === "projects" && <p className="notice">HGAB3 is the latest House reading. Retained NEP/API matches were established against HGAB2; HGAB3 uses the recorded reading comparison. Repeated House records appear as one grouped row. The optional region matching mode adds flagged candidates across different source regions. <a href="#house?view=projects&reading=third">Search the 3rd-reading House project tree</a> or <a href="#compare?view=projects&change=reading_changed">show changed House allocations</a>.</p>}
      {tab === "paps" && <p className="muted">PAP totals include the separate Foreign-assisted projects (FAP) control and reconcile to operations. FAP is outside the Transparency listing scope; its Transparency amount is unavailable.</p>}

      </details>
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
      <p className="comparison-scope">Amounts in PHP · HGAB3 is the latest House reading · Change = HGAB3 − HGAB2.
        {tab==='projects' && ' NEP matches are candidates established against HGAB2. Select a project title to inspect its full tree path.'}
        {tab==='paps' && ' Operations include local and foreign-assisted projects; Transparency covers its retained listing only.'}
      </p>
      {source && <div className="workspace-switch" aria-label="Workspace panels">
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
      }
      <div className={`comparison-workspace ${source ? 'has-source' : ''} ${panel}-active`}>
        <section className="comparison-table" aria-label="Comparison table">
          <div className="filters">
            <label>
              Search
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={()=>{if(searchDraft!==query)setQuery(searchDraft);}}
                onKeyDown={e=>{if(e.key==='Enter' && searchDraft!==query)setQuery(searchDraft);}}
                placeholder="Title, source ID, or office"
              />
            </label>
            <Filter
              label="Program"
              extraOptions={tab==='projects' || program==='fap' ? [{value:'fap',label:'Foreign-assisted projects (FAPs)'}] : []}
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
            <button className="more-filters" aria-expanded={moreFilters} onClick={()=>setMoreFilters(!moreFilters)}>More filters</button>
          </div>
          <div className={`filters advanced-filters ${moreFilters ? 'open' : ''}`}>
            {tab !== "paps" && (
              <label>
                Engineering office / DEO
                <select aria-label="Engineering office / DEO" value={office} onChange={(e) => setOffice(e.target.value)}>
                  <option value="">All offices</option>
                  {office && !offices.some(o=>o.value===office) && <option value={office}>Unavailable office: {displayOffice(office)}</option>}
                  {offices.map(o => (
                    <option key={o.value} value={o.value}>{displayOffice(o.label)}</option>
                  ))}
                </select>
              </label>
            )}
            {tab !== 'gaps' && <label>House reading change
              <select aria-label="House reading change" value={readingStatus} onChange={e=>setReadingStatus(e.target.value)}>
                {[["", "All records"], ["reading_changed", "Changed allocations"], ["third_only", "HGAB3 only"], ["second_only", "HGAB2 only"], ["amount_changed", "Paired amount changes"], ["repeated_key", "Repeated keys / grouped"], ["same_amount", "Same House amount"]].map(([value,text])=><option key={value} value={value}>{text}</option>)}
              </select>
            </label>}
            {tab === "projects" && <label>Region matching
              <select aria-label="Region matching" value={regionMatching} onChange={e=>setFinding('regionMatching',e.target.value)}>
                <option value="strict">Require same region</option>
                <option value="ignore">Allow different regions · flag candidates</option>
              </select>
            </label>}
            {tab === "projects" && <label>Match status
              <select aria-label="Match status" value={matchStatus} onChange={e=>setMatchStatus(e.target.value)}>
                <option value="">All identity statuses</option>
                {MATCH_STATUS_OPTIONS.map(([value,text])=><option key={value} value={value}>{text}</option>)}
              </select>
            </label>}
            {tab === "projects" && <label>Flags
              <select aria-label="Review flags" value={flag} onChange={e=>setFlag(e.target.value)}>
                <option value="">All flags</option>
                {FLAG_OPTIONS.map(([value,text])=><option key={value} value={value}>{text}</option>)}
              </select>
            </label>}
          </div>
          {tab !== "paps" && <p className="muted">Office filters use recorded source assignments. Paired sources may list different offices; fuzzy suggestions are excluded. Match status is identity quality; flags are presence, amount change, and Transparency coverage.</p>}
          {matchStatus==='matched_chainage' && <p className="muted">Matched after chainage check: same road title_base with differing station spans. NEP and HGAB amount cells show that source’s chainage spans and length; HGAB also shows Δ chainage length vs NEP (km and %). Compare those with the budget Δ in the same columns.</p>}
          {tab === "projects" && regionMatching === 'ignore' && <p className="notice">
            {projectRows.filter(r=>r.region_difference).length.toLocaleString()} unique-title pairs merged across differing source labels (region, office, program or PAP), so {projectRows.length.toLocaleString()} comparison rows now carry both House and NEP amounts instead of appearing as separate unmatched rows.
            Source regions, offices and programs remain recorded separately on the merged row. Duplicate titles stay separate; amounts do not determine identity. PAP totals are unchanged.
          </p>}
          {hasFilters && <div className="active-filters" aria-label="Active filters">
            {[['query',query],['program',program],...(tab==='paps'?[]:[['region',region],['office',office]]),...(tab==='gaps'?[]:[['readingStatus',readingStatus]]),...(tab==='projects'?[['matchStatus',matchStatus],['flag',flag],['trace',trace],...(regionMatching==='ignore'?[['regionMatching','Allow different regions']]:[])]:[])].filter(([,v])=>v).map(([key,v])=><button key={key} onClick={()=>{setFinding(key,key==='regionMatching'?'strict':'');if(key==='query')setSearchDraft('');}} aria-label={`Remove ${key} filter`}>{key==='matchStatus' ? matchStatusLabel(v) : key==='flag' ? flagLabel(v) : key==='program' ? programLabel(v) : key==='region' ? displayRegion(v) : key==='office' ? displayOffice(v) : label(v)} ×</button>)}
            <button onClick={()=>{for(const key of ['query','program','region','office','matchStatus','flag','trace','readingStatus'])setFinding(key,'');setFinding('regionMatching','strict');setSearchDraft('');}}>Clear filters</button>
          </div>}
          {flag==='house_only' && <p className="muted">Insertion candidates: HGAB2 or HGAB3 records with no attached NEP or Transparency source. Unmatched records can reflect title or assignment differences; this does not confirm absence from the NEP PDF.</p>}
          {(flag==='nep_only'||flag==='nep_only_suggested') && <p className="muted">Deletion candidates: NEP line items with no attached House record. {flag==='nep_only_suggested'?'At least one unmatched House row names this NEP item as a fuzzy counterpart — review for a re-titled or re-scoped replacement. Suggestions refer to House rows, not certified identities.':'No unmatched House row suggests a counterpart. Title or assignment differences can prevent pairing; this does not confirm removal.'}</p>}
          {matchStatus==='fuzzy' && <p className="muted">Fuzzy matches are the OCR triage queue: similar House and NEP titles in the same scope, with residual spelling to promote into normalize rules.</p>}
          <div className="mobile-sort">
            <label>Sort results<select aria-label="Sort results" value={column} onChange={e=>{setColumn(e.target.value);setMode('total');}}>
              {(tab==='gaps'?[['title','Project'],['amount','Amount'],['region','Region'],['pdf_page','PDF page']]:[['title',tab==='paps'?'PAP':'Project'],...tableNames.map((n,i)=>[String(i),n]),['reading_delta','HGAB3 − HGAB2']]).map(([v,n])=><option key={v} value={v}>{n}</option>)}
            </select></label><button onClick={()=>setDirection(-direction)}>{direction===1?'Ascending ↑':'Descending ↓'}</button>
          </div>
          <div className="results-toolbar">
            <p className="result-count" aria-live="polite">{tab==='projects' && !projects ? 'Loading project records…' : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} ${tab==='projects'?'comparison rows':'rows'}`}{searchDraft!==query ? ' · Updating search…':''}</p>
            {tab==='projects' && <button ref={analyticsButton} disabled={!filtered.length || searchDraft!==query} onClick={()=>setAnalytics({rows:filtered,finding:{...finding}})}>Show analytics</button>}
            <ShareLink />
            <button disabled={!filtered.length || searchDraft!==query} onClick={()=>downloadResults(filtered,finding,'csv')}>Export CSV</button>
            <button disabled={!filtered.length || searchDraft!==query} onClick={()=>downloadResults(filtered,finding,'json')}>Export JSON</button>
          </div>
          {tab==='projects' && <p className="muted count-explanation">Comparison rows are not unique projects. Unresolved House/NEP counterparts may appear separately. Source allocation records and amounts are counted independently.</p>}
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
                      {header("HGAB3 − HGAB2", "reading_delta")}
                      <th scope="col">Source evidence</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(visiblePage * 50, visiblePage * 50 + 50).map((r, i) => (
                  <React.Fragment key={r.id ?? r.source_id ?? `${page}-${i}`}><tr>
                    <th scope="row">
                      {tab === 'projects' ? <button className="project-record-title" aria-expanded={finding.record===r.id} onClick={()=>setFinding('record',finding.record===r.id?'':r.id)}>{r.title}</button> : r.label ?? r.title}
                      <small>
                        {r.program} · {r.region ?? ""}
                      </small>
                      {tab==='projects' && <StatusInfo info={MATCH_STATUS_INFO[identityMatchStatus(r)] || matchInfo[r.trace]} fallback={matchStatusLabel(identityMatchStatus(r)) || label(r.trace)} />}
                      {counterpartCounts.has(r.id) && <small className="counterpart-badge">Suggested NEP counterpart · unresolved ({counterpartCounts.get(r.id)} House comparison {counterpartCounts.get(r.id)===1?'row':'rows'}). Kept separately pending review.</small>}
                      {r.suggestions?.length>0 && <button className="candidate-review-button" aria-expanded={finding.record===r.id} onClick={()=>setFinding('record',finding.record===r.id?'':r.id)}>Review {r.suggestions.length} NEP {r.suggestions.length===1?'suggestion':'suggestions'}</button>}
                      {r.region_difference && <small>Region differs · House: {r.region_difference.house} · NEP: {r.region_difference.nep} · candidate only</small>}
                      {r.reason && identityMatchStatus(r)!=='matched_chainage' && <small className="normalized-match-badge">Matched after title normalization ({r.reason})</small>}
                      {tab==='projects' && identityMatchStatus(r)==='matched_chainage' && <small className="normalized-match-badge">Matched after chainage check{r.reason?` · ${r.reason}`:''}</small>}
                      {tab !== "gaps" && <StatusInfo info={readingInfo[r.reading_status]} fallback={label(r.reading_status)} />}
                      {tab !== 'paps' && <small>{compactOffices(r)}</small>}

                    </th>
                    {tab === "gaps" ? (
                      <>
                        <td className="num" data-label="Amount">{amount(r.amount_php)}</td>
                        <td data-label="Region">{r.region}</td>
                      </>
                    ) : (
                      values(r, tab).map((value, index) => (
                        <Money
                          key={index}
                          value={value}
                          prior={values(r, tab)[index - 1]}
                          caption={tableNames[index]}
                          chainage={tab==='projects' && identityMatchStatus(r)==='matched_chainage' ? chainageForColumn(r, index) : null}
                        />
                      ))
                    )}
                    {tab !== "gaps" && <td data-label="HGAB3 − HGAB2" className={`num ${r.reading_delta_php > 0 ? "up" : r.reading_delta_php < 0 ? "down" : ""}`}>
                      {r.reading_delta_php > 0 ? "+" : ""}{amount(r.reading_delta_php)}
                    </td>}
                    <td data-label="Source evidence">
                      {tab === "paps" ? (
                        <>
                          {sourceButtons("nep", [r.nep_page], r.label)}
                          {sourceButtons("house-second", r.second_pages, r.label)}
                          {sourceButtons("house-third", r.third_pages, r.label)}
                        </>
                      ) : tab === "gaps" ? (
                        sourceButtons("nep", [r.pdf_page], r.title)
                      ) : (
                        <>
                          {sourceButtons("nep", [r.nep?.pdf_page], r.title)}
                          {sourceButtons("house-second", r.second?.pdf_pages, r.title)}
                          {sourceButtons("house-third", r.third?.pdf_pages, r.title)}
                          {!r.nep?.pdf_page && !r.second?.pdf_page && !r.third?.pdf_page && (
                            <small>No PDF page recorded</small>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {tab==='projects' && finding.record===r.id && <tr className="project-path-detail"><td colSpan={7}><Suspense fallback={<p role="status">Loading project path…</p>}>
                    <ProjectPaths row={r} onPreview={(record)=>open("nep",record.pdf_page,record.title)} sourceKey={finding.pathSource} onSourceChange={key=>setFinding('pathSource',key)} />
                  </Suspense></td></tr>}
                  </React.Fragment>
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

          </div>
        </section>
        {source && <aside className="source-pane" aria-label="PDF source pane">
          <Suspense fallback={<p role="status">Loading PDF preview…</p>}>
            <PdfPreview source={source} onClose={()=>{setSource(null);setPanel('table');}} />
          </Suspense>
        </aside>}
      </div>
      {analytics && <Suspense fallback={<p role="status">Loading analytics…</p>}><ProjectAnalytics rows={analytics.rows} finding={analytics.finding} returnFocus={analyticsButton.current} onClose={()=>setAnalytics(null)}/></Suspense>}
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
            ["delta", `Change: ${['Transparency coverage','NEP − Transparency (coverage)','HGAB2 − NEP (candidate)','HGAB3 − HGAB2'][Number(menu.column)]}`],
            ["percent", `Percent change vs ${['Transparency','Transparency','NEP','HGAB2'][Number(menu.column)]}`],
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
function Filter({ label: caption, rows, field, value, set, extraOptions=[] }) {
  const options=useMemo(()=>[...new Set(rows.flatMap(r=>field==='region' ? officeAssignments(r).map(a=>a.region) : [r[field]]).filter(Boolean))].sort(),[rows,field]);
  return (
    <label>
      {caption}
      <select
        aria-label={caption}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">All</option>
        {extraOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        {value && !options.includes(value) && !extraOptions.some(o=>o.value===value) && <option value={value}>Unavailable: {field==='region'?displayRegion(value):label(value)}</option>}
        {options
          .map((v) => (
            <option key={v} value={v}>
              {field==='region'?displayRegion(v):label(v)}
            </option>
          ))}
      </select>
    </label>
  );
}
function Money({value,prior,caption,chainage=null}) {
 const delta=metric(value,prior,'delta'),percent=metric(value,prior,'percent');
 const lengthClass=chainage?.direction==='up'?'up':chainage?.direction==='down'?'down':'';
 return <td className="num" data-label={caption} title={value==null?'No amount recorded':`${value.toLocaleString('en-PH')} PHP`}>
  <strong>{amount(value)}</strong>
  {delta!=null && <small className={`delta ${delta>0?'up':delta<0?'down':''}`}>Δ {delta>0?'+':''}{amount(delta)} ({percent==null?'n/a':`${percent>0?'+':''}${percent.toFixed(1)}%`})</small>}
  {chainage && <div className="chainage-in-cell">
   <small>Chainage: {chainage.spans}</small>
   {chainage.lengthKm && <small>Chainage length: {chainage.lengthKm}</small>}
   {chainage.deltaKm && <small className={`chainage-length-delta ${lengthClass}`}>{chainage.deltaKind==='station'?'Δ Chainage':'Δ Chainage length'}: {chainage.deltaKm}{chainage.deltaPct?` (${chainage.deltaPct})`:''}</small>}
  </div>}
 </td>;
}

function StatusInfo({info,fallback}) {
 if(!info)return <small>{fallback}</small>;
 return <details className="status-info"><summary>{info[0]} <span aria-label="Status information">ⓘ</span></summary><p>{info[1]}</p></details>;
}
/** Project columns: API, NEP, HGAB2, HGAB3 — chainage only on NEP/HGAB. */
function chainageForColumn(row, index) {
 if(index===1)return chainageSideDetail(row.nep);
 if(index===2)return chainageSideDetail(row.second || row.house, row.nep, {withDelta:true});
 if(index===3)return chainageSideDetail(row.third, row.nep, {withDelta:true});
 return null;
}
function compactOffices(row){
 const groups=new Map();
 for(const a of officeAssignments(row))if(a.office)groups.set(a.office,[...(groups.get(a.office)??[]),a.source]);
 return groups.size ? [...groups].map(([office,sources])=>`${displayOffice(office)} (${sources.join(', ')})`).join(' · ') : 'No recorded office';
}

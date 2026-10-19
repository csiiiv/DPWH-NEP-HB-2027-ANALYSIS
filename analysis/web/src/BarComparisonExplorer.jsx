import React, {useEffect, useMemo, useRef, useState} from 'react';
import {loadData} from './data.js';
import {money} from './fmrModel.js';
import {barComparisonModel, layoutBarChart, sortBars, splitCentralOffice, sumBars, collapseBars, SORTS, SEGMENTS, SIDES} from './barComparison.js';
import './BarComparison.css';

const count = n => n.toLocaleString('en-PH');
const compact = n => Math.abs(n) >= 1e9 ? `₱${(n / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 3})}B`
  : Math.abs(n) >= 1e6 ? `₱${(n / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M` : money(n);
const percent = (n, h) => n ? `${((h - n) / n * 100).toLocaleString('en-PH', {maximumFractionDigits: 2, signDisplay: 'exceptZero'})}%` : h ? 'New HGAB amount' : '—';
const sentence = text => text ? text[0].toLocaleUpperCase() + text.slice(1) : text;
// The delta already lives inside the side amounts (Increased ₱10→₱15 shows
// ₱10 on NEP and ₱15 on HGAB); one-sided classes note their bar.
const sideNote = key => key === 'deletion' ? ' · NEP side only' : key === 'insertion' ? ' · HGAB side only' : '';
// Compact-view choices: keep the largest N groups by NEP, combine the rest
// into Others. null (All) draws every group.
const TOP_BRANCHES = [{top: null, label: 'All'}, {top: 3, label: 'Top 3'}, {top: 5, label: 'Top 5'}, {top: 10, label: 'Top 10'}];

export default function BarComparisonExplorer({route, exact}) {
  const [catalog, setCatalog] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadData('budget_flow_sources_2027.json', controller.signal).then(data => {
      if (data.schema_version !== 1 || !data.sources?.length) throw new Error('Unsupported flow-source catalog.');
      setCatalog(data);
    }).catch(e => {if (e.name !== 'AbortError') setError(e.message);});
    return () => controller.abort();
  }, [attempt]);
  if (error) return <section className="fmr-section" role="alert"><h2>Bar comparison sources could not load</h2><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></section>;
  if (!catalog) return <p role="status">Loading budget sources…</p>;
  const payload = catalog.sources.find(s => s.dataset.key === route.params.get('dataset')) || catalog.sources[0];
  // The worked example compares regions; other datasets keep their catalog default.
  const defaultDetail = payload.dataset.key === 'dpwh' ? 'region' : payload.dataset.defaultGrouping;
  const groupingKey = Object.hasOwn(payload.groupings, route.params.get('detail'))
    ? route.params.get('detail') : defaultDetail;
  const setParam = (patch = {}) => {
    const params = new URLSearchParams(route.params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    params.set('tab', 'bars');
    window.location.hash = `experiments?${params}`;
  };
  return <section className="fmr-section" aria-labelledby="experiments-bars-heading">
    <h2 id="experiments-bars-heading">{payload.dataset.label} · NEP and HGAB bar comparison</h2>
    <p>One horizontal bar pair per {payload.groupings[groupingKey].label.toLocaleLowerCase()} — NEP above, HGAB below, segmented by revision class on one shared peso scale so segments stay comparable across every detail. Dataset and detail level come from the validated budget-flow catalog; both ledgers must reconcile before any bar is drawn.</p>
    <BarComparisonFigure key={`${payload.dataset.key}:${groupingKey}`} payload={payload} groupingKey={groupingKey}
      datasets={catalog.sources.map(s => s.dataset)} exact={exact} route={route} setParam={setParam}/>
  </section>;
}

function BarComparisonFigure({payload, groupingKey, datasets, exact, route, setParam}) {
  const order = SORTS.some(s => s.key === route.params.get('sort')) ? route.params.get('sort') : 'nep';
  const topParam = TOP_BRANCHES.some(t => String(t.top) === route.params.get('top')) ? Number(route.params.get('top')) : null;
  const result = useMemo(() => {
    try {
      const model = barComparisonModel(payload, groupingKey);
      // The hide option is a DPWH affordance: its Central Office group (DEO
      // grain) concentrates most of the ledger, unlike HFEP's same-named
      // facility subcategory, which stays comparable among its peers.
      const dpwh = model.dataset.key === 'dpwh';
      const {visible, hidden} = dpwh ? splitCentralOffice(model.bars) : {visible: model.bars, hidden: []};
      const hiding = dpwh && hidden.length > 0 && route.params.get('hide') === 'central_office';
      const drawable = hiding ? visible : model.bars;
      // Top-N collapses after hiding, so Others never contains the hidden CO.
      // Others is pinned last whatever the display sort, like the flow figures.
      const {kept, others, rollup} = collapseBars(drawable, {top: topParam, plural: model.grouping.plural});
      const bars = others ? [...sortBars(kept, order), others] : sortBars(drawable, order);
      return {model, bars, hidden, hiding, hiddenTotals: sumBars(hidden),
        shownTotals: sumBars(drawable), rollup, others};
    } catch (e) {return {error: e.message};}
  }, [payload, groupingKey, order, topParam, route]);
  const layout = useMemo(() => result.bars ? layoutBarChart(result.bars) : null, [result.bars]);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const svgRef = useRef(null);
  if (result.error) return <p role="alert">Bar comparison unavailable: {result.error}</p>;
  const {model, bars, hidden, hiding, hiddenTotals} = result;
  const dataset = model.dataset, grouping = model.grouping, totals = model.totals;
  // Metrics describe the drawn scope; the exact table and its Total keep everything.
  const shown = hiding ? result.shownTotals : totals;
  const scopeNote = hiding ? `excludes ${hidden.map(b => b.label).join(', ')}` : null;
  const format = exact ? money : compact;
  const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
  const date = new Intl.DateTimeFormat('en-PH', {dateStyle: 'medium', timeZone: 'Asia/Manila'}).format(new Date());
  const filename = `${dataset.key}-2027-${groupingKey}-nep-hgab-bars${hiding ? '-no-central-office' : ''}`;
  const changeDataset = key => setParam({dataset: key === 'dpwh' ? null : key, detail: null, sort: null, hide: null, top: null});
  // Detail changes keep dataset-level choices (sort/top) but drop the DPWH-only hide.
  const download = async type => {
    setExportError(''); setExporting(true);
    try {
      const copy = svgRef.current.cloneNode(true);
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const [width, height] = svgRef.current.getAttribute('viewBox').split(' ').map(Number);
      copy.setAttribute('width', width); copy.setAttribute('height', height);
      const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order'];
      const originals = [svgRef.current, ...svgRef.current.querySelectorAll('*')], clones = [copy, ...copy.querySelectorAll('*')];
      originals.forEach((node, index) => {
        const style = getComputedStyle(node);
        for (const property of properties) clones[index].style.setProperty(property, style.getPropertyValue(property));
      });
      const svgBlob = new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml;charset=utf-8'});
      if (type === 'svg') return saveBlob(svgBlob, `${filename}.svg`);
      const url = URL.createObjectURL(svgBlob);
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {image.onload = resolve; image.onerror = () => reject(new Error('Image export could not render. Try SVG.')); image.src = url;});
        const canvas = document.createElement('canvas');
        const ratio = Math.min(2, 16000 / width, 16000 / height);
        canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PNG export is unavailable in this browser. Try SVG.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('PNG export failed. Try SVG.');
        saveBlob(png, `${filename}.png`);
      } finally {URL.revokeObjectURL(url);}
    } catch (e) {setExportError(e.message);} finally {setExporting(false);}
  };
  const barAria = bar => `${bar.label}: DBM NEP ${money(bar.nep)}, HGAB ${money(bar.hgab)}, change ${signed(bar.hgab - bar.nep)}`;
  return <div className="bar-comparison">
    <div className="budget-flow-metrics" aria-label="Bar comparison totals">
      {[
        ['NEP allocation', format(shown.nep), scopeNote || 'DBM original proposal'],
        ['HGAB allocation', format(shown.hgab), scopeNote || dataset.house_note],
        ['Net change', signed(shown.delta), 'HGAB minus NEP'],
        [sentence(grouping.plural), count(bars.length), hidden.length && hiding ? `${count(hidden.length)} hidden` : 'One bar pair each'],
        [sentence(dataset.count_unit), count(shown.rows), dataset.key === 'dpwh' ? 'Comparison candidates' : 'Compared records'],
      ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </div>
    <div className="budget-flow-toolbar" data-image-export-omit>
      <label className="budget-flow-group-select">Dataset source <select aria-label="Dataset source" value={dataset.key} onChange={e => changeDataset(e.target.value)}>
        {datasets.map(source => <option key={source.key} value={source.key}>{source.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select">Detail level <select aria-label="Detail level" value={groupingKey} onChange={e => setParam({detail: e.target.value})}>
        {Object.values(payload.groupings).map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select">Sort <select aria-label="Sort" value={order} onChange={e => setParam({sort: e.target.value === 'nep' ? null : e.target.value})}>
        {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select">Top branches <select aria-label="Top branches"
        value={topParam ?? 'all'} onChange={e => setParam({top: e.target.value === 'all' ? null : e.target.value})}>
        {TOP_BRANCHES.map(t => <option key={t.label} value={t.top ?? 'all'}>{t.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select"><input type="checkbox" checked={hiding}
        disabled={!hidden.length} onChange={e => setParam({hide: e.target.checked ? 'central_office' : null})}/>
        Hide Central Office</label>
      <div className="budget-flow-exports">
        <button onClick={() => download('svg')} disabled={exporting}>Download SVG</button>
        <button onClick={() => download('png')} disabled={exporting}>Download PNG</button>
        {exporting && <span role="status">Preparing image…</span>}
      </div>
    </div>
    {exportError && <p role="alert" data-image-export-omit>{exportError}</p>}
    <p className="fmr-muted" id="bar-comparison-help">Each bar is segmented by revision class in one shared order — Unchanged, Increased, Decreased, then Deleted (NEP) or Inserted (HGAB). Amounts are side-specific: a pair that rose ₱10M→₱15M shows ₱10M inside the NEP bar and ₱15M inside the HGAB bar, so the growth reads as the width difference between the paired segments. Both bars start with the same Unchanged width; all segments share one scale. {grouping.basis}</p>
    {hiding && <p className="bar-comparison-scope" data-image-export-omit>Shown: {count(bars.length)} of {count(bars.length + hidden.length)} {grouping.plural}. Hidden: <strong>{hidden.map(b => b.label).join(', ')}</strong> — NEP {money(hiddenTotals.nep)} → HGAB {money(hiddenTotals.hgab)} ({signed(hiddenTotals.delta)}). Hiding re-fits the shared peso scale to the visible {grouping.plural}; the exact table below keeps every row.</p>}
    <div className="bar-comparison-legend" role="group" aria-label="Revision classes">
      {SEGMENTS.map(seg => <span key={seg.key}><i style={{background: seg.color}}/> {seg.label}{sideNote(seg.key)}</span>)}
      <span className="bar-comparison-legend-note">{SORTS.find(s => s.key === order)?.label} · {result.rollup ? `Top ${result.rollup.top} + Others` : `All ${count(bars.length)} ${grouping.plural}`}</span>
    </div>
    <figure className="bar-comparison-figure" aria-labelledby="bar-comparison-caption">
      <figcaption id="bar-comparison-caption">
        <div className="bar-comparison-caption">{dataset.label} · {grouping.label} · NEP beside HGAB, segmented by revision
          <span>Segment width represents pesos on one shared scale. Hover a segment for its paired NEP→HGAB amounts.</span>
        </div>
      </figcaption>
      <div className="bar-comparison-scroll" role="region" aria-label={`${grouping.label} NEP and HGAB bar pairs`} tabIndex={0}>
        <svg ref={svgRef} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
          aria-label={`${dataset.label} NEP ${money(totals.nep)} and HGAB ${money(totals.hgab)} by ${grouping.label.toLocaleLowerCase()} and revision class${scopeNote ? `, ${scopeNote}` : ''}`}>
          <metadata>{JSON.stringify(exportMetadata({dataset, grouping, totals, bars, order, hidden, hiddenTotals, rollup: result.rollup, payload, date}))}</metadata>
          <g>
            {layout.rows.map(row => <g key={row.id} className="bar-comparison-row" data-id={row.id} aria-label={barAria(row)}>
              <title>{row.label} — NEP {money(row.nep)} → HGAB {money(row.hgab)} ({signed(row.hgab - row.nep)}) · {count(row.rows)} {dataset.count_unit}</title>
              {row.bars.map(side => <g key={side.key} className="bar-comparison-side" data-side={side.key} data-total={side.total}>
                {side.segments.map(segment => <g key={segment.key} className="bar-comparison-bar" data-class={segment.key}
                  data-side={side.key} data-value={segment.value} data-nep={segment.nep} data-hgab={segment.hgab} tabIndex={0}
                  aria-label={`${segment.label}${sideNote(segment.key)}: ${format(segment.value)}`}>
                  <title>{`${row.label} · ${segment.label}${sideNote(segment.key)} · ${count(segment.rows)} rows — this bar: ${money(segment.value)}; paired ${side.key === 'nep' ? 'HGAB' : 'NEP'}: ${money(side.key === 'nep' ? segment.hgab : segment.nep)} (${signed(segment.hgab - segment.nep)})`}</title>
                  <rect x={segment.x} y={segment.y} width={segment.width} height={segment.height} fill={segment.color}/>
                  {segment.labelVisible && <text x={segment.labelX} y={segment.labelY} className="bar-comparison-segment"
                    textAnchor="middle" fill={segment.textFill}>{format(segment.value)}</text>}
                </g>)}
                <text x={side.labelX} y={side.labelY} className="bar-comparison-total">{format(side.total)}</text>
              </g>)}
              {row.lines.map((line, i) => <text key={i} x={layout.labelWidth - 8} y={row.labelYs[i]} className="bar-comparison-label" textAnchor="end">{line}</text>)}
            </g>)}
          </g>
        </svg>
      </div>
    </figure>
    <div data-image-export-expand className="budget-flow-table-wrap" role="region" aria-label={`${grouping.label} NEP and HGAB amounts by revision class`} tabIndex={0}>
      <table className="budget-flow-table">
        <caption>{grouping.label} NEP and HGAB amounts by revision class · exact PHP · {dataset.count_unit}{hiding ? ' · includes hidden groups' : ''}{result.rollup ? ` · Others combines ${result.rollup.members.length} ${grouping.plural}` : ''}</caption>
        <thead><tr>
          <th scope="col" rowSpan="2">{grouping.label}</th>
          <th scope="col" rowSpan="2">{sentence(dataset.count_unit)}</th>
          <th scope="col" colSpan="4">NEP (PHP)</th>
          <th scope="col" colSpan="4">HGAB (PHP)</th>
          <th scope="col" rowSpan="2">Change (PHP)</th>
        </tr>
        <tr>
          {['Unchanged', 'Increased', 'Decreased', 'Deleted'].map(label => <th scope="col" key={`nep-${label}`}>{label}</th>)}
          {['Unchanged', 'Increased', 'Decreased', 'Inserted'].map(label => <th scope="col" key={`hgab-${label}`}>{label}</th>)}
        </tr></thead>
        <tbody>{(() => {
          const others = bars.filter(b => b.id === '__others__');
          const drawn = bars.filter(b => b.id !== '__others__');
          return [...sortBars([...drawn, ...hidden], order), ...others];
        })().map(bar => {
          const c = bar.classes, isHidden = hidden.some(b => b.id === bar.id);
          const isOthers = bar.id === '__others__';
          return <tr key={bar.id} className={isHidden ? 'is-hidden-row' : isOthers ? 'is-others-row' : ''}
            title={isOthers ? `Others combines: ${bar.members.map(m => m.label).join('; ')}` : undefined}>
            <th scope="row">{bar.label}{isHidden ? ' ·' : ''}</th>
            <td>{count(bar.rows)}</td>
            <td>{money(c.unchanged?.nep || 0)}</td><td>{money(c.increased?.nep || 0)}</td><td>{money(c.reduced?.nep || 0)}</td><td>{money(c.deletion?.nep || 0)}</td>
            <td>{money(c.unchanged?.hgab || 0)}</td><td>{money(c.increased?.hgab || 0)}</td><td>{money(c.reduced?.hgab || 0)}</td><td>{money(c.insertion?.hgab || 0)}</td>
            <td>{bar.hgab - bar.nep > 0 ? '+' : ''}{money(bar.hgab - bar.nep)}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr>
          <th scope="row">Total · all {grouping.plural}</th><td>{count(model.totals.rows)}</td>
          <td colSpan="4">{money(model.totals.nep)}</td><td colSpan="4">{money(model.totals.hgab)}</td>
          <td>{money(model.totals.delta)}</td>
        </tr></tfoot>
      </table>
    </div>
    <details className="budget-flow-provenance"><summary>Sources, reconciliation and interpretation</summary>
      <p>{dataset.scope} {dataset.house_note}. {dataset.matching}</p>
      <p>Segments rebuild both published ledgers before drawing: NEP {money(model.totals.nep)} and HGAB {money(model.totals.hgab)} over {count(model.totals.rows)} {dataset.count_unit}. Increased and Decreased segments carry each side's own amount for the same rows — the width difference between the paired segments is the gross change; Unchanged is identical on both bars; Deleted exists only at NEP and Inserted only at HGAB. All visible segments share one peso scale; the tables keep exact amounts{hidden.length ? ' and the hidden rows' : ''}.</p>
      {hiding && <p>Hide Central Office removes centrally-managed groups from the bars and re-fits the peso scale to the remaining {grouping.plural}; their allocations ({hidden.map(b => b.label).join(', ')}: NEP {money(hiddenTotals.nep)}, HGAB {money(hiddenTotals.hgab)}) remain listed above and inside the Total row. Nothing is deleted from the source catalog.</p>}
      {payload.provenance && <p>Input: <code>{payload.provenance.source}</code> · SHA-256 <code>{payload.provenance.sha256}</code>.</p>}
      <p>{dataset.caveat}</p>
    </details>
  </div>;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportMetadata({dataset, grouping, totals, bars, order, hidden, hiddenTotals, rollup, payload, date}) {
  return {title: `FY2027 ${dataset.label} NEP/HGAB bar comparison by ${grouping.label}`,
    dataset: {key: dataset.key, label: dataset.label, count_unit: dataset.count_unit, scope: dataset.scope, house_note: dataset.house_note},
    grouping: {key: grouping.key, label: grouping.label}, order,
    bars: bars.map(({id, label, nep, hgab, rows, classes}) => ({id, label, nep, hgab, rows,
      classes: Object.fromEntries(Object.entries(classes).map(([key, c]) => [key, {rows: c.rows, nep: c.nep, hgab: c.hgab}]))})),
    hidden: hidden.length ? {groups: hidden.map(g => g.id), nep: hiddenTotals.nep, hgab: hiddenTotals.hgab, delta: hiddenTotals.delta, rows: hiddenTotals.rows} : null,
    rollup: rollup || null,
    totals: {nep: totals.nep, hgab: totals.hgab, rows: totals.rows, delta: totals.delta},
    unit: 'PHP', date, versions: `DBM NEP → HGAB · ${dataset.house_note}`,
    source: payload.provenance || 'budget_flow_sources_2027.json', caveat: dataset.caveat};
}

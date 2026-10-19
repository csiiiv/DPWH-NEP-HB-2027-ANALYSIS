import React, {useMemo, useRef, useState} from 'react';
import {money} from './fmrModel.js';
import {buildBudgetFlowModel, collapseBudgetGroups, budgetFlowRecordLink, FLOW_CAVEAT} from './budgetFlowModel.js';
import './BudgetCategoryFlow.css';
import RevisionFlowDiagram from './RevisionFlowDiagram.jsx';
import {layoutRevisionFlow} from './revisionFlowLayout.js';
import {sectionToPng} from './sectionImage.js';

const count = n => n.toLocaleString('en-PH');
const compact = n => Math.abs(n) >= 1e9 ? `₱${(n / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 3})}B`
  : Math.abs(n) >= 1e6 ? `₱${(n / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M` : money(n);
const percent = (n, h) => n ? `${((h - n) / n * 100).toLocaleString('en-PH', {maximumFractionDigits: 2, signDisplay: 'exceptZero'})}%` : h ? 'New HGAB amount' : '—';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportFigure(svg, format, filename) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const [,, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  copy.setAttribute('width', width); copy.setAttribute('height', height);
  const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order', 'dominant-baseline'];
  const originals = [svg, ...svg.querySelectorAll('*')], clones = [copy, ...copy.querySelectorAll('*')];
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of properties) clones[index].style.setProperty(property, style.getPropertyValue(property));
  });
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml;charset=utf-8'});
  if (format === 'svg') return saveBlob(blob, `${filename}.svg`);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {image.onload = resolve; image.onerror = () => reject(new Error('Image export could not render. Try SVG.')); image.src = url;});
    const canvas = document.createElement('canvas');
    const ratio = Math.min(2, 16000 / width, 16000 / height);
    canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser. Try SVG.');
    // Opaque white base: canvases start transparent, so the exported PNG
    // would otherwise show the viewer's dark mode through it.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG export failed. Try SVG.');
    saveBlob(png, `${filename}.png`);
  } finally {URL.revokeObjectURL(url);}
}

export default function BudgetCategoryFlow({payload, groupingKey = 'category', exact, route, workspace}) {
  const alignment = route.params.get('align') === 'center' ? 'center' : 'top';
  const compactView = route.params.get('detail') !== 'all';
  const groupParam = route.params.get('group');
  const result = useMemo(() => {
    try {
      const complete = buildBudgetFlowModel(payload, groupingKey);
      // Existing links to a category hidden in Others still open that exact
      // category in full detail rather than silently changing their scope.
      const compact = compactView && !complete.groups.slice(3).some(g => g.id === groupParam);
      const model = compact ? collapseBudgetGroups(complete) : complete;
      if (model.totals.nep !== workspace.sources.nep.amount_php || model.totals.hgab !== workspace.sources.house.amount_php) throw new Error('Budget flow and Overview amounts differ. Rebuild the data together.');
      return {model, layout: layoutRevisionFlow(model.flow, {alignment}), compact};
    } catch (error) {return {error: error.message};}
  }, [payload, groupingKey, workspace, alignment, compactView, groupParam]);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const svgRef = useRef(null), sectionRef = useRef(null);
  if (result.error) return <p role="alert">Budget flow unavailable: {result.error}</p>;
  const {model, layout} = result;
  const dataset = model.dataset, grouping = model.grouping;
  const unit = dataset.count_unit, plural = grouping.plural;
  const focusLabel = groupingKey === 'deo' ? 'DEO / office' : grouping.label === 'PAP' ? 'PAP' : grouping.label.toLocaleLowerCase();
  const caveat = dataset.caveat || FLOW_CAVEAT;
  const filename = dataset.key === 'dpwh' && groupingKey === 'category' ? 'dpwh-2027-budget-categories' : `${dataset.key}-2027-${groupingKey}-budget-flow`;
  const sectionFilename = dataset.key === 'dpwh' && groupingKey === 'category' ? 'dpwh-2027-budget-flow-section' : `${filename}-section`;
  const evidence = (revision, group, rows) => {
    const link = budgetFlowRecordLink(model, revision, group);
    return <a href={link.href}>{link.scoped ? `Inspect ${count(rows)} supporting ${unit} →` : 'Open comparison workspace →'}</a>;
  };
  const selectedGroup = model.groups.find(g => g.id === route.params.get('group'));
  const selectedRevision = model.categories.find(c => c.key === route.params.get('revision'));
  const presentation = model.rollup ? `Top 3 by NEP + Others (${model.rollup.members.length} ${plural})` : `All ${plural}`;
  const detailMode = result.compact ? 'top3' : 'all';
  const format = exact ? money : compact;
  const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
  const update = (group, revision) => {
    const params = new URLSearchParams(route.params);
    params.delete('category');
    if (detailMode === 'all') params.set('detail', 'all');
    if (group) params.set('group', group); else params.delete('group');
    if (revision) params.set('revision', revision); else params.delete('revision');
    window.location.hash = `experiments?${params}`;
  };
  const setDetailMode = mode => {
    const params = new URLSearchParams(route.params);
    if (mode === 'all') {
      params.set('detail', 'all');
      if (selectedGroup?.members) params.delete('group');
    } else {
      params.delete('detail');
      const full = buildBudgetFlowModel(payload, groupingKey);
      if (selectedGroup && !full.groups.slice(0, 3).some(g => g.id === selectedGroup.id)) params.set('group', 'others');
    }
    window.location.hash = `experiments?${params}`;
  };
  const selectRevision = (revision, group = '') => update(group, selectedRevision?.key === revision && (selectedGroup?.id || '') === group ? '' : revision);
  const detail = selectedRevision ? (selectedGroup?.cells || model.categories).find(c => c.key === selectedRevision.key) : selectedGroup;
  const detailLabel = [selectedGroup?.label, selectedRevision?.label].filter(Boolean).join(' · ');
  const date = new Intl.DateTimeFormat('en-PH', {dateStyle: 'medium', timeZone: 'Asia/Manila'}).format(new Date());
  const download = async type => {
    setExportError(''); setExporting(true);
    try {
      if (type === 'section') {
        const section = sectionRef.current.closest('.fmr-section') || sectionRef.current;
        const png = await sectionToPng(section, {prepare: copy => {
          const help = copy.querySelector('.budget-flow-help');
          if (help) help.textContent = help.textContent.replace(' Scroll within the diagram to explore.', '');
        }});
        saveBlob(png, `${sectionFilename}.png`);
      } else await exportFigure(svgRef.current, type, filename);
    } catch (error) {setExportError(error.message);} finally {setExporting(false);}
  };
  return <div className="budget-category-flow" ref={sectionRef}>
    <div className="budget-flow-metrics" aria-label="Budget flow totals">
      {[
        ['NEP allocation', format(model.totals.nep), 'DBM original proposal'],
        ['HGAB allocation', format(model.totals.hgab), dataset.house_note],
        ['Gross additions', `+${format(model.totals.additions)}`, 'Insertions + increases'],
        ['Gross reductions', `−${format(model.totals.reductions)}`, 'Deletions + decreases'],
        ['Net change', signed(model.totals.delta), 'HGAB minus NEP'],
      ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </div>
    <p className="budget-flow-caveat">{caveat}</p>
    <div className="budget-flow-toolbar" data-image-export-omit>
      <label className="budget-flow-group-select">{grouping.label} detail <select aria-label={`${grouping.label} detail`} value={detailMode} onChange={e => setDetailMode(e.target.value)}>
        <option value="top3">Top 3 + Others</option><option value="all">All {plural}</option>
      </select></label>
      <label className="budget-flow-group-select">Focus {focusLabel} <select aria-label={`Focus ${focusLabel}`} value={selectedGroup?.id || ''} onChange={e => update(e.target.value, selectedRevision?.key)}>
        <option value="">All {plural}</option>{model.groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select></label>
      <label className="budget-flow-group-select">Alignment <select aria-label="Flow alignment" value={alignment} onChange={e => {
        const params = new URLSearchParams(route.params);
        if (e.target.value === 'center') params.set('align', 'center'); else params.delete('align');
        window.location.hash = `experiments?${params}`;
      }}>
        <option value="top">Top</option><option value="center">Centered</option>
      </select></label>
      <div className="budget-flow-exports">
        <button onClick={() => download('svg')} disabled={exporting}>Download SVG</button>
        <button onClick={() => download('png')} disabled={exporting}>Download PNG</button>
        <button onClick={() => download('section')} disabled={exporting}>Download section PNG</button>
        {exporting && <span role="status">Preparing image…</span>}
      </div>
    </div>
    <div className="budget-flow-legend" role="group" aria-label="Highlight a revision type">
      {model.categories.map(c => <button key={c.key} aria-pressed={selectedRevision?.key === c.key && !selectedGroup} onClick={() => selectRevision(c.key)}>
        <span style={{color: c.color}} aria-hidden="true">{c.cue}</span> {c.label}{['insertion', 'deletion'].includes(c.key) ? '*' : ''}
      </button>)}
      {(selectedGroup || selectedRevision) && <button data-image-export-omit onClick={() => update('', '')}>Clear selection</button>}
    </div>
    {exportError && <p role="alert" data-image-export-omit>{exportError}</p>}
    <p className="fmr-muted budget-flow-help" id="budget-flow-help">{model.rollup
      ? `Top 3 ${plural} by NEP allocation, with the remaining ${model.rollup.members.length} combined into Others. All groups and amounts remain included. Others preserves its own five-cell revision matrix; select it to see the constituent groups or expand them.`
      : `Five stages, grouped by ${grouping.label} (${model.groups.length} groups). Each group keeps its own revision matrix; zero-value cells are omitted.`} Floating + stubs are new House money; House Reductions ends below its group’s HGAB node. Band widths share one peso scale. Scroll within the diagram to explore.</p>
    <RevisionFlowDiagram model={model.flow} layout={layout} svgRef={svgRef}
      selection={{group: selectedGroup?.id, revision: selectedRevision?.key}} onSelect={({group, revision}) => update(group, revision)}
      title={`FY2027 · ${dataset.label} · Five-stage budget alluvial`} caption={`${dataset.label} · five-stage budget alluvial`}
      captionDetail={`NEP total → ${plural} → revision cells within each group → ${plural} → HGAB total · ${presentation} · ${count(model.totals.rows)} ${unit} · PHP`}
      description={`NEP ${money(model.totals.nep)} through ${model.groups.length} displayed groups (${presentation}) and five revision cells per group to HGAB ${money(model.totals.hgab)}. ${caveat}`}
      subtitle={`${date} · Grouping: ${grouping.label} · ${presentation} · All ${unit} · Selected: ${detailLabel || 'all'}`}
      formatValue={format} formatExact={money} formatCount={count} describedBy="budget-flow-help"
      revisionSuffix={key => ['insertion', 'deletion'].includes(key) ? '*' : ''}
      metadata={{title: `FY2027 ${dataset.label} five-stage budget alluvial`, dataset: {key: dataset.key, label: dataset.label, count_unit: unit, scope: dataset.scope, house_note: dataset.house_note}, grouping: model.grouping, filters: `all ${unit}`, presentation, rollup: model.rollup || null, alignment, date, unit: 'PHP', versions: `DBM NEP → HGAB · ${dataset.house_note}`, source: payload.provenance || 'dpwh_flow_2027.json', caveat}}
      footer={[
        `Source: FY2027 ${dataset.label} · NEP → HGAB · PHP · ${grouping.label} · ${presentation}`,
        `Net ${signed(model.totals.delta)} = gross additions ${format(model.totals.additions)} − gross reductions ${format(model.totals.reductions)}`,
        '* Unmatched insertion/deletion candidates. Retained pair identities also remain provisional. Observed changes do not establish transfers.',
        'New money enters through floating stubs. Gross cuts end in per-group House Reductions. Deletions end at C. Zero-value cells omitted.',
        `Version: ${payload.provenance?.sha256 ? `comparison SHA-256 ${payload.provenance.sha256.slice(0, 16)}` : 'dpwh_flow_2027.json'}`,
      ]}/>
    <section className="budget-flow-detail" aria-labelledby="budget-detail-heading" aria-live="polite">
      <h3 id="budget-detail-heading">{detail ? `${detailLabel} · detail` : 'Group and revision details'}</h3>
      {detail ? <>
        <p>{count(detail.rows)} {unit} · {percent(detail.nep, detail.hgab)}.</p>
        <p><strong>NEP {money(detail.nep)}</strong> → <strong>HGAB {money(detail.hgab)}</strong> · Δ {signed(detail.delta)}</p>
        <p className="fmr-muted">{selectedRevision && ['insertion', 'deletion'].includes(selectedRevision.key) ? 'No verified counterpart is attached. Missing matches do not confirm insertions or deletions.' : 'Amounts compare retained project/line-item rows. Matching remains provisional.'}</p>
        {selectedGroup?.members ? <div className="budget-flow-others-detail">
          <p>Others combines these {selectedGroup.members.length} {plural}. Supporting rows remain available for each group:</p>
          <ul>{selectedGroup.members.map(g => {
            const cell = selectedRevision ? g.cells.find(c => c.key === selectedRevision.key) : g;
            const link = budgetFlowRecordLink(model, selectedRevision?.key, g.id);
            return <li key={g.id}>{cell.rows ? <a href={link.href}>{g.label} · {count(cell.rows)} {unit}{link.scoped ? ' →' : ' · Open comparison workspace →'}</a> : `${g.label} · 0 ${unit}`}</li>;
          })}</ul>
          <button data-image-export-omit onClick={() => setDetailMode('all')}>Expand Others</button>
        </div> : evidence(selectedRevision?.key, selectedGroup?.id, detail.rows)}
      </> : <p className="fmr-muted">Choose a group or one of its revision cells to inspect both allocations and the supporting line items.</p>}
    </section>
    <div data-image-export-expand className="budget-flow-table-wrap" role="region" aria-label={`Revision totals across all ${plural}`} tabIndex={0}>
      <table className="budget-flow-table">
        <caption>Revision totals across all {plural} · exact PHP · {unit}</caption>
        <thead><tr><th scope="col">Revision</th><th scope="col">Rows</th><th scope="col">NEP (PHP)</th><th scope="col">HGAB (PHP)</th><th scope="col">Change (PHP)</th><th scope="col">Change %</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{model.categories.map(c => <tr key={c.key} className={selectedRevision?.key === c.key ? 'is-selected' : ''}>
          <th scope="row"><button onClick={() => selectRevision(c.key)} aria-pressed={selectedRevision?.key === c.key}>{c.label}{['insertion', 'deletion'].includes(c.key) ? '*' : ''}</button></th>
          <td>{count(c.rows)}</td><td>{money(c.nep)}</td><td>{money(c.hgab)}</td><td>{c.delta > 0 ? '+' : ''}{money(c.delta)}</td><td>{percent(c.nep, c.hgab)}</td>
          <td><a href={budgetFlowRecordLink(model, c.key).href} aria-label={budgetFlowRecordLink(model, c.key).scoped ? `Inspect ${c.label.toLowerCase()} records` : `Open comparison workspace for ${dataset.label}`}>{budgetFlowRecordLink(model, c.key).scoped ? 'Records →' : 'Open comparison →'}</a></td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td>{count(model.totals.rows)}</td><td>{money(model.totals.nep)}</td><td>{money(model.totals.hgab)}</td><td>{money(model.totals.delta)}</td><td>{percent(model.totals.nep, model.totals.hgab)}</td><td/></tr></tfoot>
      </table>
    </div>
    <details className="budget-flow-provenance"><summary>Sources, reconciliation and interpretation</summary>
      <p>{dataset.scope} {dataset.house_note}. {dataset.matching}</p>
      <p>{grouping.basis} Each intermediary repeats the same revision matrix. Insertions and gross increases enter as floating stubs; gross reductions end in that group's own sink. All monetary nodes and ribbons share one scale. Group totals rebuild both ledgers. Gross changes remain separate even at zero net change.</p>
      {model.rollup && <p>The three largest {plural} by NEP allocation remain separate. Others contains: {model.rollup.members.map(g => g.label).join('; ')}. Cells are summed by revision type; all original amounts and counts remain included.</p>}
      <p>Counts use {unit}. Evidence links open the exact scoped population where the comparison workspace supports that grouping; other dimensions link to the unfiltered comparison workspace.</p>
      {payload.provenance && <p>Input: <code>{payload.provenance.source}</code> · SHA-256 <code>{payload.provenance.sha256}</code>.</p>}
      <p>{caveat}</p>
    </details>
  </div>;
}

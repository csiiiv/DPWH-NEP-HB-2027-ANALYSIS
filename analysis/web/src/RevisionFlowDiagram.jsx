import React, {useId, useMemo, useState} from 'react';
import {layoutRevisionFlow, wrapFlowLabel} from './revisionFlowLayout.js';
import './RevisionFlowDiagram.css';

const number = n => n.toLocaleString();
const noSuffix = () => '';
const activate = handler => event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); handler();}};
// Reusable presentation only: callers own data loading, routes, evidence links,
// currency, provenance, controls and export filenames. Selection may be either
// controlled (selection + onSelect) or local to this diagram.
export default function RevisionFlowDiagram({model, layout: suppliedLayout, svgRef,
  title = `${model.labels.before} → ${model.labels.after}`, caption, captionDetail,
  description, subtitle, footer = [], metadata = {}, describedBy,
  formatValue = number, formatExact = formatValue, formatCount = number,
  revisionSuffix = noSuffix, selection, onSelect,
}) {
  const uid = useId();
  const computedLayout = useMemo(() => suppliedLayout || layoutRevisionFlow(model), [model, suppliedLayout]);
  const layout = computedLayout, labels = model.labels, format = formatValue;
  const [localSelection, setLocalSelection] = useState({}), [hover, setHover] = useState(null);
  const active = selection ?? localSelection;
  const selectedGroup = model.groups.find(g => g.id === active.group);
  const selectedRevision = model.matrix.cells.find(c => c.key === active.revision);
  const focusedGroup = hover?.group || selectedGroup?.id;
  const focusedRevision = hover?.revision || selectedRevision?.key;
  const dimmed = (group, revision) => focusedGroup && focusedGroup !== group || focusedRevision && revision && focusedRevision !== revision;
  const update = (group, revision) => {const next = {group: group || '', revision: revision || ''}; setLocalSelection(next); onSelect?.(next);};
  const selectRevision = (revision, group) => update(group, selectedRevision?.key === revision && selectedGroup?.id === group ? '' : revision);
  const selectGroup = group => update(selectedGroup?.id === group ? '' : group, selectedRevision?.key);
  const stages = [[70, `A · ${labels.before}`], [350, `B · ${labels.intermediaryBefore}`],
    [725, `C · ${labels.matrix}`], [1115, `D · ${labels.intermediaryAfter}`], [1395, `E · ${labels.after}`]];
  return (
    <figure className="revision-flow-figure" aria-labelledby={`${uid}-caption`}>
      <figcaption id={`${uid}-caption`}>{caption || title}<span>{captionDetail}</span></figcaption>
      <div data-image-export-expand className="revision-flow-scroll" role="region" aria-label="Scrollable five-stage revision diagram" tabIndex={0} aria-describedby={describedBy}>
        <div data-image-export-omit className="revision-flow-stage-strip" aria-hidden="true">{stages.map(([x, label]) => <span key={label} style={{left: `${x / layout.width * 100}%`}}>{label}</span>)}</div>
        <svg ref={svgRef} viewBox={`0 0 ${layout.width} ${layout.height}`} data-scale={layout.scale} data-alignment={layout.alignment} role="group" aria-labelledby={`${uid}-title ${uid}-desc`}>
          <title id={`${uid}-title`}>{title}</title>
          <desc id={`${uid}-desc`}>{description || `${labels.before} ${formatExact(model.totals.before)} through ${model.groups.length} groups to ${labels.after} ${formatExact(model.totals.after)}.`}</desc>
          <metadata>{JSON.stringify({...metadata, selection: {group: selectedGroup?.id || 'all', revision: selectedRevision?.key || 'all'}})}</metadata>
          <rect width={layout.width} height={layout.height} fill="#fff"/>
          <text x={28} y={30} className="bf-title">{title}</text>
          <text x={28} y={52} className="bf-subtitle">{wrapFlowLabel(subtitle || '', 200).slice(0, 2).map((line, index) => <tspan key={index} x={28} dy={index ? 14 : 0}>{line}</tspan>)}</text>
          {stages.map(([x, title]) => <text key={title} x={x} y={92} textAnchor="middle" className="bf-stage">{title}</text>)}
          <text x={70} y={116} textAnchor="middle" className="bf-total">{format(model.totals.before)}</text>
          <text x={1395} y={116} textAnchor="middle" className="bf-total">{format(model.totals.after)}</text>
          <text x={755} y={116} className="bf-side">{labels.matrix} · {labels.before} → {labels.after}</text>
          {layout.rows.map(g => <line key={g.id} x1={285} x2={1255} y1={g.y + g.height - 5} y2={g.y + g.height - 5} stroke="#e5ebf2"/>)}
          {layout.ribbons.map(r => <path key={r.key} data-group={r.groupId} data-revision={r.revision || ''} data-source={r.source} data-target={r.target} data-value={r.value} d={r.d} fill={r.color} className="bf-ribbon" opacity={dimmed(r.groupId, r.revision) ? .04 : .5}
            onMouseEnter={() => setHover({group: r.groupId, revision: r.revision})} onMouseLeave={() => setHover(null)} onClick={() => r.revision ? selectRevision(r.revision, r.groupId) : selectGroup(r.groupId)}>
            <title>{`${r.groupId} · ${r.sourceName} → ${r.targetName}: ${formatExact(r.value)}`}</title>
          </path>)}
          {layout.stubs.map(stub => <g key={stub.key} className="bf-stub" data-group={stub.groupId} data-category={stub.revision} data-target={stub.target} data-value={stub.value}
            role="button" tabIndex={0} aria-label={`${stub.groupId} · ${stub.revision === 'scope_review' ? 'Unbooked scope-review surplus' : `${stub.revision} ${labels.additions}`}: ${formatExact(stub.value)}`}
            onClick={() => selectRevision(stub.revision, stub.groupId)} onKeyDown={activate(() => selectRevision(stub.revision, stub.groupId))}
            onMouseEnter={() => setHover({group: stub.groupId, revision: stub.revision})} onMouseLeave={() => setHover(null)} opacity={dimmed(stub.groupId, stub.revision) ? .15 : 1}>
            <title>{`${stub.revision === 'scope_review' ? 'Unbooked scope-review surplus' : labels.additions} · ${formatExact(stub.value)} · ${stub.revision === 'scope_review' ? 'not booked as a same-project increase' : stub.revision === 'insertion' ? 'full inserted value' : 'gross increase only'}`}</title>
            <rect className="bf-stub-band" data-value={stub.value} x={stub.x} y={stub.y} width={stub.width} height={stub.height} fill={stub.color} opacity={.65}/>
            <circle cx={stub.portX} cy={stub.portY} r={3.5} fill={stub.color}/>
            <text x={stub.labelX} y={stub.labelY} textAnchor="end" className="bf-stub-label">+{format(stub.value)}</text>
          </g>)}
          {Object.entries(layout.ledgers).map(([key, ledger]) => ledger.height > 0 && !layout.nodes.some(n => n.role === 'outerLedger') && <rect key={key}
            data-stage={key === 'before' ? 'A' : 'E'} data-node="total-ledger" data-value={ledger.value}
            x={ledger.x} y={ledger.y} width={18} height={ledger.height} fill="#203147">
            <title>{`${key === 'before' ? labels.before : labels.after}: ${formatExact(model.totals[key])}`}</title>
          </rect>)}
          {layout.nodes.filter(n => n.role === 'outerLedger').map(segment => <rect key={segment.key}
            data-stage={segment.side === 'before' ? 'A' : 'E'} data-node="outer-ledger" data-node-key={segment.key} data-group={segment.groupId} data-value={segment.value}
            x={segment.x} y={segment.y} width={segment.width} height={segment.height} fill="#203147"
            opacity={dimmed(segment.groupId) ? .2 : 1}>
            <title>{`${segment.name}: ${formatExact(segment.value)}`}</title>
          </rect>)}
          {layout.rows.map(g => <g key={g.id} className="bf-group-row" data-group={g.id}>
            {[[g.left, 'B', g.before], [g.right, 'D', g.after]].map(([node, stage, amount]) => <g key={stage} role="button" tabIndex={0} aria-pressed={selectedGroup?.id === g.id} aria-label={`${stage} · ${g.label}: ${formatExact(amount)}`}
              onClick={() => selectGroup(g.id)} onKeyDown={activate(() => selectGroup(g.id))} onMouseEnter={() => setHover({group: g.id})} onMouseLeave={() => setHover(null)}>
              <text x={node.x} y={g.y + 17} textAnchor="middle" className="bf-group-name">{wrapFlowLabel(g.label).map((line, i) => <tspan key={i} x={node.x} dy={i ? 14 : 0}>{line}</tspan>)}</text>
              {amount > 0 && <rect data-stage={stage} data-node="ledger" data-node-key={node.key} data-value={amount} x={node.x} y={node.y} width={12} height={node.height} fill="#4f7db3" opacity={dimmed(g.id) ? .2 : 1}/>}
              <text x={stage === 'B' ? node.x - 10 : node.x + 22} y={node.y + node.height / 2} textAnchor={stage === 'B' ? 'end' : 'start'} className="bf-group-amount">{format(amount)}</text>
            </g>)}
            {g.cells.map(c => <g key={c.key} className={`bf-cell${selectedGroup?.id === g.id && selectedRevision?.key === c.key ? ' is-selected' : ''}`} data-category={c.key} data-group={g.id}
              role="button" tabIndex={0} aria-pressed={selectedGroup?.id === g.id && selectedRevision?.key === c.key}
              aria-label={`${g.label} · ${c.label}: ${labels.before} ${formatExact(c.before)}, ${labels.after} ${formatExact(c.after)}, ${formatCount(c.count)} ${labels.count}`}
              onKeyDown={activate(() => selectRevision(c.key, g.id))} onClick={() => selectRevision(c.key, g.id)} onFocus={() => setHover({group: g.id, revision: c.key})} onBlur={() => setHover(null)}
              onMouseEnter={() => setHover({group: g.id, revision: c.key})} onMouseLeave={() => setHover(null)} opacity={dimmed(g.id, c.key) ? .25 : 1}>
              <rect className="bf-cell-hit" x={c.x - 3} y={c.slotY} width={350} height={c.slotHeight} fill="transparent"/>
              <rect className="bf-revision-node" data-node-key={c.nodeKey} data-value={c.value} x={c.x} y={c.y} width={c.width} height={c.height} fill={c.color}>
                <title>{`${c.label}: ${labels.before} ${formatExact(c.before)}; ${labels.after} ${formatExact(c.after)}; node value ${formatExact(c.value)}`}</title>
              </rect>
              <text x={755} y={c.labelY} className="bf-revision-label">
                <tspan fontWeight="700">{c.cue} {c.label}{revisionSuffix(c.key)}</tspan>
                <tspan> · {format(c.before)} → {format(c.after)}</tspan>
              </text>
            </g>)}
            {g.reductionSink && <g className="bf-reduction-sink" data-group={g.id} role="button" tabIndex={0}
              aria-label={`${labels.reductions} · ${g.label}: ${formatExact(g.reductionSink.value)}`} aria-pressed={selectedGroup?.id === g.id && selectedRevision?.key === 'reduced'}
              onClick={() => selectRevision('reduced', g.id)} onKeyDown={activate(() => selectRevision('reduced', g.id))}
              onMouseEnter={() => setHover({group: g.id, revision: 'reduced'})} onMouseLeave={() => setHover(null)} opacity={dimmed(g.id, 'reduced') ? .2 : 1}>
              <rect data-stage="D" data-node="reductions" data-node-key={g.reductionSink.key} data-value={g.reductionSink.value}
                x={g.reductionSink.x} y={g.reductionSink.y} width={g.reductionSink.width} height={g.reductionSink.height} fill={g.reductionSink.color}/>
              <text x={g.reductionSink.x + 22} y={g.reductionSink.y + g.reductionSink.height / 2 - 13} className="bf-sink-label">
                <tspan fontWeight="700">{labels.reductions}</tspan>
                <>{wrapFlowLabel(g.label, 52).map((line, i) => <tspan key={i} x={g.reductionSink.x + 22} dy="13">{line}</tspan>)}</>
                <tspan x={g.reductionSink.x + 22} dy="13">{format(g.reductionSink.value)}</tspan>
              </text>
            </g>}
          </g>)}
          {layout.sinks.filter(sink => sink.role === 'scopeLoss').map(sink => <g key={sink.key} className="bf-scope-sink" data-group={sink.groupId}
            role="button" tabIndex={0} aria-label={`Unbooked scope-review deficit · ${sink.groupId}: ${formatExact(sink.value)}`}
            aria-pressed={selectedGroup?.id === sink.groupId && selectedRevision?.key === 'scope_review'}
            onClick={() => selectRevision('scope_review', sink.groupId)} onKeyDown={activate(() => selectRevision('scope_review', sink.groupId))}
            onMouseEnter={() => setHover({group: sink.groupId, revision: 'scope_review'})} onMouseLeave={() => setHover(null)} opacity={dimmed(sink.groupId, 'scope_review') ? .2 : 1}>
            <rect data-stage="D" data-node="scope-review-deficit" data-node-key={sink.key} data-value={sink.value}
              x={sink.x} y={sink.y} width={sink.width} height={sink.height} fill={sink.color}/>
            <text x={sink.x + 22} y={sink.y + sink.height / 2 - 13} className="bf-sink-label">
              <tspan fontWeight="700">Unbooked scope-review deficit</tspan>
              <tspan x={sink.x + 22} dy="13">{format(sink.value)}</tspan>
            </text>
          </g>)}
          {footer.slice(0, 5).map((line, i) => <text key={i} x={28} y={layout.height - 98 + i * 20} className="bf-footer">{line}</text>)}
        </svg>
      </div>
    </figure>
  );
}

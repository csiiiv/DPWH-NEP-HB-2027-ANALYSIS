import {ribbonPath} from './columnFlow.js';
import {wrapFlowLabel} from './revisionFlowLayout.js';

// Dedicated layout engine for the experiments tab's category revision flow
// (#experiments?tab=pap). Deliberately separate from revisionFlowLayout.js —
// the Budget flow tab owns that engine — so experiment layout changes can
// never disturb the report figure, and vice versa.
//
// Behavior: the shared five-stage grammar with rows centered in their slots,
// plus outer A/E ledger segments placed at exactly the same y as their
// group's B/D nodes, so every outer ribbon is level and each group reads as
// one horizontal band. Segment heights stay exactly value × scale and can
// never overlap because rows stack without sharing vertical extent.
export function layoutPapFlow(model, {valueHeight = 520} = {}) {
  const offset = (space, size) => (space - size) / 2;
  const width = 1480, top = 138, groupHeading = 40;
  const graphs = model.groups.map(g => g.graph);
  const envelope = graphs.reduce((s, graph) => s + graph.nodes.filter(n => n.column === 1).reduce((t, n) => t + n.value, 0), 0);
  if (!Number.isFinite(valueHeight) || valueHeight <= 0) throw new Error('Pap flow: valueHeight must be positive');
  const scale = valueHeight / Math.max(1, envelope);
  const columnX = {before: 350, revision: 716, after: 1115};
  const plans = graphs.map((graph, index) => {
    const label = model.groups[index].label;
    const heading = Math.max(groupHeading, wrapFlowLabel(label).length * 14 + 12);
    const cells = graph.nodes.filter(n => n.column === 1).sort((a, b) => a.order - b.order);
    const cellSlots = cells.map(n => Math.max(graph.stubs.some(s => s.target === n.key) ? 34 : 24, n.value * scale + 10));
    const stack = cellSlots.reduce((s, h) => s + h, 0);
    const after = graph.nodes.find(n => n.role === 'after');
    const sink = graph.nodes.find(n => n.role === 'reductions');
    const scopeSink = graph.nodes.find(n => n.role === 'scopeLoss');
    const sinkSlot = sink ? Math.max(44, (wrapFlowLabel(label, 52).length + 2) * 13 + 5, sink.value * scale) : 0;
    const scopeSinkSlot = scopeSink ? Math.max(44, (wrapFlowLabel(label, 52).length + 2) * 13 + 5, scopeSink.value * scale) : 0;
    const rightHeight = (after?.value || 0) * scale + (sink ? 32 + sinkSlot : 0) + (scopeSink ? 32 + scopeSinkSlot : 0);
    const bodyHeight = Math.max(stack, rightHeight);
    return {cells, cellSlots, stack, sink, sinkSlot, scopeSink, scopeSinkSlot, bodyHeight, heading, height: heading + bodyHeight + 24};
  });
  const flowTop = top + (plans[0]?.heading || groupHeading);
  const plotHeight = plans.reduce((s, p) => s + p.height, 0);
  const height = top + plotHeight + 124;
  // Ledger entries exist for their keys and totals; the renderer suppresses
  // the single bars whenever outerLedger segments are present.
  const ledgers = {
    before: {key: model.graph.nodes.find(n => n.role === 'totalBefore')?.key || 'empty:before', x: 70,
      y: top + (plotHeight - model.totals.before * scale) / 2,
      height: model.totals.before * scale, value: model.totals.before},
    after: {key: model.graph.nodes.find(n => n.role === 'totalAfter')?.key || 'empty:after', x: 1395,
      y: top + (plotHeight - model.totals.after * scale) / 2,
      height: model.totals.after * scale, value: model.totals.after},
  };
  const ribbons = [], stubs = [], sinks = [], positioned = [];
  let rowY = top;
  const rows = model.groups.map((group, index) => {
    const graph = graphs[index], plan = plans[index];
    const bodyY = rowY + plan.heading;
    const left = {key: graph.keys.before, x: columnX.before, y: bodyY + offset(plan.bodyHeight, group.before * scale), height: group.before * scale, value: group.before};
    const rightBlock = group.after * scale + (plan.sink ? 32 + plan.sinkSlot : 0) + (plan.scopeSink ? 32 + plan.scopeSinkSlot : 0);
    const right = {key: graph.keys.after, x: columnX.after, y: bodyY + offset(plan.bodyHeight, rightBlock), height: group.after * scale, value: group.after};
    const map = new Map();
    if (group.before) map.set(left.key, {...graph.nodes.find(n => n.key === left.key), ...left, width: 12});
    if (group.after) map.set(right.key, {...graph.nodes.find(n => n.key === right.key), ...right, width: 12});
    let slotY = bodyY + offset(plan.bodyHeight, plan.stack);
    const cells = plan.cells.map((node, ci) => {
      const slotHeight = plan.cellSlots[ci], h = node.value * scale;
      const nodeY = slotY + offset(slotHeight, h);
      const source = group.cells.find(c => c.key === node.revision);
      const cell = {...source, nodeKey: node.key, groupId: group.id, order: node.order, x: columnX.revision,
        y: nodeY, width: 18, height: h, value: node.value,
        slotY, slotHeight, labelY: nodeY + h / 2 + 4, color: node.color};
      map.set(node.key, {...node, x: cell.x, y: cell.y, width: 18, height: h, value: node.value});
      slotY += slotHeight;
      return cell;
    });
    let reductionSink = null;
    if (plan.sink) {
      const h = plan.sink.value * scale;
      reductionSink = {...plan.sink, x: columnX.after, y: right.y + right.height + 32 + offset(plan.sinkSlot, h),
        height: h, width: 12, value: plan.sink.value, label: `${model.labels.reductions} · ${group.label}`};
      map.set(reductionSink.key, reductionSink);
      sinks.push(reductionSink);
    }
    // A scope-review deficit has its own terminal node, separate from cuts.
    if (plan.scopeSink) {
      const baseY = reductionSink ? reductionSink.y + reductionSink.height + 32 : right.y + right.height + 32;
      const h = plan.scopeSink.value * scale;
      const sink = {...plan.scopeSink, x: columnX.after, y: baseY + offset(plan.scopeSinkSlot, h),
        height: h, width: 12, value: plan.scopeSink.value, label: `Unbooked scope-review deficit · ${group.label}`};
      map.set(sink.key, sink);
      sinks.push(sink);
    }
    // Reserve the addition stub above the existing base at an Increased node.
    const sourceY = new Map([...map].map(([key, n]) => [key, n.y]));
    const targetY = new Map([...map].map(([key, n]) => [key, n.y]));
    for (const stub of graph.stubs) {
      const node = map.get(stub.target), y = targetY.get(stub.target), h = stub.value * scale;
      stubs.push({...stub, x: node.x - 34, y, width: 34, height: h, portX: node.x - 34, portY: y + h / 2,
        labelX: node.x - 44, labelY: y + h / 2 - 7});
      targetY.set(stub.target, y + h);
    }
    const links = graph.links.map(l => ({...l}));
    for (const node of map.values()) {
      for (const l of links.filter(l => l.source === node.key).sort((a, b) => map.get(a.target).order - map.get(b.target).order)) {
        l.sourceY = sourceY.get(node.key); sourceY.set(node.key, l.sourceY + l.value * scale);
      }
      for (const l of links.filter(l => l.target === node.key).sort((a, b) => map.get(a.source).order - map.get(b.source).order)) {
        l.targetY = targetY.get(node.key); targetY.set(node.key, l.targetY + l.value * scale);
      }
    }
    const addRibbon = (link, source, target, y0, y1) => ribbons.push({...link,
      sourceY: y0, targetY: y1, height: link.value * scale,
      sourceName: source.name || group.label, targetName: target.name || group.label,
      // Every ribbon has identical thickness at BOTH ends. Value only
      // enters at a stub or ends in a deletion/reduction sink.
      d: ribbonPath(source.x + source.width, y0, y0 + link.value * scale, target.x, y1, y1 + link.value * scale)});
    for (const link of links) addRibbon(link, map.get(link.source), map.get(link.target), link.sourceY, link.targetY);
    // Outer A→B and D→E ribbons: each exact ledger segment sits at the same y
    // as its B/D group node, so the outer ribbons stay level.
    if (group.before) {
      addRibbon(model.graph.links.find(l => l.source === ledgers.before.key && l.groupId === group.id),
        {x: ledgers.before.x, width: 18, name: model.labels.before}, {...left, name: `${group.label} · ${model.labels.intermediaryBefore}`}, left.y, left.y);
      positioned.push({key: `${group.id}::ledger:before`, role: 'outerLedger', side: 'before', groupId: group.id,
        x: ledgers.before.x, y: left.y, width: 18, height: group.before * scale, value: group.before,
        name: `${model.labels.before} · ${group.label}`});
    }
    if (group.after) {
      addRibbon(model.graph.links.find(l => l.target === ledgers.after.key && l.groupId === group.id),
        {...right, width: 12, name: `${group.label} · ${model.labels.intermediaryAfter}`}, {x: ledgers.after.x, name: model.labels.after}, right.y, right.y);
      positioned.push({key: `${group.id}::ledger:after`, role: 'outerLedger', side: 'after', groupId: group.id,
        x: ledgers.after.x, y: right.y, width: 18, height: group.after * scale, value: group.after,
        name: `${model.labels.after} · ${group.label}`});
    }
    positioned.push(...map.values());
    const row = {...group, y: rowY, height: plan.height, left, right, reductionSink, cells};
    rowY += plan.height;
    return row;
  });
  return {width, height, scale, alignment: 'midpoint', flowTop, ledgers, rows, ribbons, stubs, sinks, nodes: positioned};
}

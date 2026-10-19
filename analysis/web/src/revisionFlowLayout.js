import {ribbonPath} from './columnFlow.js';

export function wrapFlowLabel(text, limit = 38) {
  const lines = [''];
  for (const word of text.split(' ')) {
    if ((lines.at(-1) + ' ' + word).trim().length > limit && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
  }
  return lines;
}

// Monetary geometry never has a minimum height. Label slots reserve their own
// space so tiny values remain to scale. All five columns use the same scale.
//
// alignment:
//   'top'    every column starts at its slot top; A/E tile contiguously.
//   'center' rows center inside their slots; A/E are single centered bars.
// The experiments tab's matched-segment variant lives in papFlowLayout.js.
export function layoutRevisionFlow(model, {valueHeight = 520, alignment = 'top'} = {}) {
  if (!['top', 'center'].includes(alignment)) throw new Error('Revision flow: alignment must be top or center');
  const offset = (space, size) => alignment === 'top' ? 0 : (space - size) / 2;
  const width = 1480, top = 138, groupHeading = 40;
  const graphs = model.groups.map(g => g.graph);
  const envelope = graphs.reduce((s, graph) => s + graph.nodes.filter(n => n.column === 1).reduce((t, n) => t + n.value, 0), 0);
  if (!Number.isFinite(valueHeight) || valueHeight <= 0) throw new Error('Revision flow: valueHeight must be positive');
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
    const sinkSlot = sink ? Math.max(44, (wrapFlowLabel(label, 52).length + 2) * 13 + 5, sink.value * scale) : 0;
    const rightHeight = (after?.value || 0) * scale + (sink ? 32 + sinkSlot : 0);
    const bodyHeight = Math.max(stack, rightHeight);
    return {cells, cellSlots, stack, sink, sinkSlot, bodyHeight, heading, height: heading + bodyHeight + 24};
  });
  const flowTop = top + (plans[0]?.heading || groupHeading);
  const plotHeight = plans.reduce((s, p) => s + p.height, 0);
  const height = top + plotHeight + 124;
  const ledgers = {
    before: {key: model.graph.nodes.find(n => n.role === 'totalBefore')?.key || 'empty:before', x: 70,
      y: alignment === 'top' ? flowTop : top + (plotHeight - model.totals.before * scale) / 2,
      height: model.totals.before * scale, value: model.totals.before},
    after: {key: model.graph.nodes.find(n => n.role === 'totalAfter')?.key || 'empty:after', x: 1395,
      y: alignment === 'top' ? flowTop : top + (plotHeight - model.totals.after * scale) / 2,
      height: model.totals.after * scale, value: model.totals.after},
  };
  const ribbons = [], stubs = [], sinks = [], positioned = [];
  let rowY = top, beforeCursor = ledgers.before.y, afterCursor = ledgers.after.y;
  const rows = model.groups.map((group, index) => {
    const graph = graphs[index], plan = plans[index];
    const bodyY = rowY + plan.heading;
    const left = {key: graph.keys.before, x: columnX.before, y: bodyY + offset(plan.bodyHeight, group.before * scale), height: group.before * scale, value: group.before};
    const rightBlock = group.after * scale + (plan.sink ? 32 + plan.sinkSlot : 0);
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
    if (group.before) addRibbon(model.graph.links.find(l => l.source === ledgers.before.key && l.groupId === group.id),
      {x: ledgers.before.x, width: 18, name: model.labels.before}, {...left, name: `${group.label} · ${model.labels.intermediaryBefore}`}, beforeCursor, left.y);
    if (group.after) addRibbon(model.graph.links.find(l => l.target === ledgers.after.key && l.groupId === group.id),
      {...right, width: 12, name: `${group.label} · ${model.labels.intermediaryAfter}`}, {x: ledgers.after.x, name: model.labels.after}, right.y, afterCursor);
    beforeCursor += group.before * scale; afterCursor += group.after * scale;
    positioned.push(...map.values());
    const row = {...group, y: rowY, height: plan.height, left, right, reductionSink, cells};
    rowY += plan.height;
    return row;
  });
  return {width, height, scale, alignment, flowTop, ledgers, rows, ribbons, stubs, sinks, nodes: positioned};
}

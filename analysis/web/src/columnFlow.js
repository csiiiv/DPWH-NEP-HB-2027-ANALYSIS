// Column-flow layout: the shared geometry engine for the experiments
// diagrams. Nodes stack proportionally inside fixed columns (an alluvial's
// defining property); ribbons route as filled beziers between adjacent
// columns using allocated extents on each node edge. Pure functions, no
// dependencies, so layout invariants are unit-testable in node.

/** Stack each column's nodes proportionally to their values, then allocate
 *  contiguous link extents on node edges and assign collision-free label
 *  slots. `stubs` are external in-flows that enter a node's left edge
 *  without originating from any column node (new money entering the
 *  pipeline). Returns positioned nodes/links/stubs plus per-column x. */
export function computeFlowLayout({nodes, links, stubs = [], width, height, nodeWidth = 14, padding = 16, marginSide = 190, marginTop = 46, labelLine = 15, minNodeHeight = 2, minLinkHeight = 0.75, stackAlign = 'center'}) {
  // Columns sorted by id, so x positions map to declared column numbers
  // regardless of the order nodes are pushed in.
  const columns = [...new Set(nodes.map(n => n.column))].sort((a, b) => a - b);
  const columnIndex = new Map(columns.map((c, i) => [c, i]));
  const usable = width - 2 * marginSide - nodeWidth;
  const columnX = new Map(columns.map((c, i) => [c, marginSide + (columns.length > 1 ? i * usable / (columns.length - 1) : 0)]));

  // Column stacks: declared order, heights proportional to value.
  const stacks = new Map(columns.map(c => [c, []]));
  for (const node of nodes) stacks.get(node.column).push(node);
  // One shared px-per-unit scale for the whole figure: every column's
  // stack must fit, so the scale is the tightest constraint and node
  // heights are comparable across columns (a taller block always means a
  // bigger value). Each column then centers within its leftover space.
  const stackInfo = columns.map(column => {
    const list = stacks.get(column).slice().sort((a, b) => a.order - b.order);
    const total = list.reduce((t, n) => t + n.value, 0);
    const available = height - marginTop - 12 - padding * (list.length - 1);
    return {column, list, total, available};
  });
  const scale = Math.min(...stackInfo.map(s => s.total > 0 ? s.available / s.total : Infinity));
  const positioned = [];
  for (const {column, list, total} of stackInfo) {
    const used = total * scale + padding * (list.length - 1);
    let y = marginTop + (stackAlign === 'top' ? 0 : Math.max(0, (height - marginTop - 12 - used) / 2));
    for (const node of list) {
      const h = Math.max(minNodeHeight, node.value * scale);
      positioned.push({...node, column_index: columnIndex.get(column),
        x0: columnX.get(column), x1: columnX.get(column) + nodeWidth, y0: y, y1: y + h, scale});
      y += h + padding;
    }
  }
  const byKey = new Map(positioned.map(n => [n.key, n]));

  // Link extents: outgoing links allocate the source's right edge, incoming
  // the target's left edge, in (target/source column, target order) order.
  const outgoing = new Map(positioned.map(n => [n.key, []]));
  const incoming = new Map(positioned.map(n => [n.key, []]));
  for (const link of links) {
    outgoing.get(link.source)?.push(link);
    incoming.get(link.target)?.push(link);
  }
  for (const stub of stubs) incoming.get(stub.target)?.push(Object.assign(stub, {isStub: true}));
  const ribbonOrder = (a, b) => {
    const ta = byKey.get(a.target), tb = byKey.get(b.target);
    return (ta.column_index - tb.column_index) || (ta.order - tb.order) ||
      (byKey.get(a.source).order - byKey.get(b.source).order);
  };
  for (const node of positioned) {
    let cursor = node.y0;
    for (const link of (outgoing.get(node.key) ?? []).sort(ribbonOrder)) {
      const h = Math.max(minLinkHeight, link.value * node.scale);
      link.y0a = cursor; link.y0b = cursor + Math.min(h, node.y1 - cursor); cursor = link.y0b;
    }
    cursor = node.y0;
    for (const link of (incoming.get(node.key) ?? []).slice().sort((a, b) => {
      if (a.isStub !== b.isStub) return a.isStub ? -1 : 1; // stubs sit above ribbons
      const sa = byKey.get(a.source), sb = byKey.get(b.source);
      return (sa.column_index - sb.column_index) || (sa.order - sb.order);
    })) {
      const h = Math.max(minLinkHeight, link.value * node.scale);
      link.y1a = cursor; link.y1b = cursor + Math.min(h, node.y1 - cursor); cursor = link.y1b;
    }
  }

  // Label slots: `labelSide: 'left'` pins a node's label beside its LEFT
  // edge (for nodes whose value is a pre-split total, e.g. Reduced); other
  // non-first columns default right. Two text lines each; slots push down
  // to stay collision-free.
  const labelSlots = new Map(positioned.map(n => [n.key, {anchor: 'start', x: n.x1 + 8, y: n.y0}]));
  const rightLabeled = new Map(columns.map(c => [c, []]));
  for (const node of positioned) {
    const left = node.labelSide === 'left' || columnIndex.get(node.column) === 0;
    const slot = labelSlots.get(node.key);
    slot.anchor = left ? 'end' : 'start';
    slot.x = left ? node.x0 - 8 : node.x1 + 8;
    if (!left) rightLabeled.get(node.column).push(node);
  }
  for (const column of columns) {
    let lastBottom = -Infinity;
    for (const node of rightLabeled.get(column)) {
      const slot = labelSlots.get(node.key);
      const boxHeight = 2 * labelLine;
      let top = Math.max((node.y0 + node.y1) / 2 - labelLine, marginTop - labelLine, lastBottom + 2);
      slot.y = top + labelLine; // baseline of the first line
      lastBottom = top + boxHeight;
    }
  }
  const placedLinks = links.map(link => {
    const source = byKey.get(link.source), target = byKey.get(link.target);
    return {...link, sourceName: source.name, targetName: target.name,
      d: ribbonPath(source.x1, link.y0a, link.y0b, target.x0, link.y1a, link.y1b)};
  });
  // Embedded ribbon values: one label per gap (between adjacent columns),
  // positioned at the ribbon's centerline so thick ribbons carry their
  // value inside the band. Labels push apart (±6px steps) to de-collide
  // within a gap, and clamp into the figure's vertical bounds.
  const gaps = new Map();
  for (const link of placedLinks) {
    const source = byKey.get(link.source), target = byKey.get(link.target);
    const gi = Math.min(source.column_index, target.column_index);
    if (!gaps.has(gi)) gaps.set(gi, []);
    gaps.get(gi).push({link, yc: (link.y0a + link.y0b + link.y1a + link.y1b) / 4,
      x: (source.x1 + target.x0) / 2, ri: source.order});
  }
  const ribbonLabels = [];
  for (const [gi, items] of gaps) {
    const byY = [...items].sort((a, b) => a.yc - b.yc);
    for (let i = 1; i < byY.length; i++) {
      let shift = 0;
      while (byY[i].yc + shift - byY[i - 1].yc < 12 && shift > -30) shift -= 3;
      byY[i].yc = Math.max(byY[i].yc + shift, marginTop + 6);
    }
    for (const item of byY) ribbonLabels.push({gi, x: item.x, y: item.yc, text: null, link: item.link, ri: item.ri});
  }
  const placedStubs = stubs.map(stub => {
    const target = byKey.get(stub.target);
    return {...stub, targetName: target.name,
      d: stubPath(target.x0, stub.y1a, stub.y1b)};
  });
  return {nodes: positioned, links: placedLinks, stubs: placedStubs, columnX, columns, labelSlots, ribbonLabels};
}

/** Short external in-flow entering a node's left edge from off-diagram.
 *  `lift` raises the port (outer end) above the entry extent so the wedge
 *  angles down into the node's top-left — used where a ribbon enters the
 *  same edge just beneath the stub. lift 0 keeps the wedge horizontal. */
export function stubPath(x, y0, y1, lift = 0) {
  const sx = x - 34;
  return `M${sx},${y0 - lift}C${x - 18},${y0 - lift} ${x - 8},${y0} ${x},${y0}` +
    `L${x},${y1}C${x - 8},${y1} ${x - 18},${y1 - lift} ${sx},${y1 - lift}Z`;
}

/** Port anchor for a stub: dot position at the wedge's outer end. */
export function stubPort(x, y0, y1, lift = 0) {
  return {cx: x - 34, cy: (y0 + y1) / 2 - lift};
}

/** Filled bezier ribbon between a source's right edge and a target's left
 *  edge. Filled shapes carry real area (unlike stroked paths whose box
 *  ignores stroke), so ribbons are hoverable and testable. */
export function ribbonPath(x0, y0a, y0b, x1, y1a, y1b) {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0a}C${mx},${y0a} ${mx},${y1a} ${x1},${y1a}` +
    `L${x1},${y1b}C${mx},${y1b} ${mx},${y0b} ${x0},${y0b}Z`;
}

import {computeFlowLayout} from './columnFlow.js';

export function wrapHierarchyLabel(label, max = 51) {
  const lines = [''];
  for (const word of label.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > max) lines.push(word);
    else lines[last] += (lines[last] ? ' ' : '') + word;
  }
  return lines;
}

export function layoutAllocationHierarchy(graph) {
  if (!graph.nodes.length) return null;
  const columns = graph.lastColumn + 1;
  const width = 62 + (columns - 1) * 519;
  const svgWidth = width + 400;
  const maxNodes = Math.max(...graph.counts);
  const padding = graph.lastColumn > 2 ? 54 : 38;
  // More branches add whitespace, rather than stretching the source bar's
  // pesos across thousands of office labels.
  const height = Math.max(560, Math.min(950, maxNodes * 22) + padding * (maxNodes - 1) + 44);
  const placed = computeFlowLayout({...graph, width, height, marginSide: 24, marginTop: 32,
    padding, minNodeHeight: 0, minLinkHeight: 0, stackAlign: 'top'});
  placed.height = height;
  for (let column = 1; column < columns; column++) {
    let bottom = 12;
    for (const node of placed.nodes.filter(n => n.column === column)) {
      const lines = wrapHierarchyLabel(node.name, column === 1 ? 38 : 51);
      const boxHeight = lines.length * 15 + 17;
      const top = Math.max((node.y0 + node.y1) / 2 - boxHeight / 2, bottom + 8);
      placed.labelSlots.get(node.key).y = top + 12;
      bottom = top + boxHeight;
    }
    placed.height = Math.max(placed.height, bottom + 20);
  }
  return {...placed, svgWidth, minWidth: Math.round(svgWidth * 1280 / 1500)};
}

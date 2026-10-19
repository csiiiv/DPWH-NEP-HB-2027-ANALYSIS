const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_PROPERTIES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order', 'dominant-baseline'];

// Build a portable SVG of the complete section. Native SVG elements keep the
// long regional/office views sharp, without a screenshot of the scroll window.
export function hierarchySectionSvg(source, {title, path, scope, summary, axes, note}) {
  if (!source) throw new Error('The allocation hierarchy is not available for export.');
  const doc = source.ownerDocument;
  const {width, height} = source.viewBox.baseVal;
  const element = (tag, attributes = {}, text) => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    return node;
  };
  const result = element('svg', {xmlns: SVG_NS, width, role: 'img', 'aria-label': title,
    'font-family': 'Arial, sans-serif'});
  result.append(element('title', {}, title));
  const background = element('rect', {width, fill: '#fff'});
  result.append(background);
  let cursor = 34;
  const paragraph = (text, size = 13, color = '#52647a', weight = 400) => {
    const max = Math.floor((width - 48) / (size * .6));
    const lines = [''];
    for (const word of text.split(/\s+/)) {
      const index = lines.length - 1;
      if (lines[index] && lines[index].length + word.length + 1 > max) lines.push(word);
      else lines[index] += (lines[index] ? ' ' : '') + word;
    }
    for (const line of lines) {
      result.append(element('text', {x: 24, y: cursor, fill: color, 'font-size': size, 'font-weight': weight}, line));
      cursor += size + 7;
    }
    cursor += 6;
  };
  paragraph(title, 22, '#203147', 700);
  paragraph(path);
  paragraph(scope);
  paragraph(summary, 14, '#203147', 600);
  result.append(element('rect', {x: 0, y: cursor, width, height: 42, fill: '#f4f7fb'}));
  for (const axis of axes) result.append(element('text', {x: axis.x, y: cursor + 26,
    fill: '#203147', 'font-size': 13, 'font-weight': 700}, axis.label));
  cursor += 42;
  const diagram = source.cloneNode(true);
  // Freeze only drawing/text styles; CSS width/min-width and scrolling belong
  // to the live page and must not resize or crop the exported SVG.
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [diagram, ...diagram.querySelectorAll('*')];
  originals.forEach((node, index) => {
    const style = doc.defaultView.getComputedStyle(node);
    for (const property of STYLE_PROPERTIES) copies[index].style.setProperty(property, style.getPropertyValue(property));
  });
  diagram.querySelectorAll('.nep-hierarchy-link').forEach(link => link.style.setProperty('fill-opacity', '.3'));
  diagram.setAttribute('x', '0'); diagram.setAttribute('y', String(cursor));
  diagram.setAttribute('width', String(width)); diagram.setAttribute('height', String(height));
  result.append(diagram);
  cursor += height + 24;
  paragraph(note, 12);
  result.setAttribute('height', String(cursor + 12));
  result.setAttribute('viewBox', `0 0 ${width} ${cursor + 12}`);
  background.setAttribute('height', String(cursor + 12));
  return {blob: new Blob([new XMLSerializer().serializeToString(result)], {type: 'image/svg+xml;charset=utf-8'}),
    width, height: cursor + 12};
}

export async function hierarchySectionPng(section) {
  const url = URL.createObjectURL(section.blob);
  try {
    const picture = new Image();
    await new Promise((resolve, reject) => {
      picture.onload = resolve;
      picture.onerror = () => reject(new Error('The hierarchy image could not render. Try Download SVG.'));
      picture.src = url;
    });
    const canvas = document.createElement('canvas');
    const ratio = Math.min(2, 16000 / section.width, 16000 / section.height);
    canvas.width = Math.max(1, Math.floor(section.width * ratio));
    canvas.height = Math.max(1, Math.floor(section.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export is unavailable in this browser. Try Download SVG.');
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The hierarchy PNG could not be saved. Try Download SVG.');
    return blob;
  } finally {URL.revokeObjectURL(url);}
}

export function saveHierarchyImage(blob, filename) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Capture at a readable report width, independent of viewport and scroll.
// The live page stays untouched; only a detached copy is expanded/reflowed.
export async function sectionToPng(section, {width = 1536, pixelRatio = 2, prepare} = {}) {
  if (!section) throw new Error('The section is not available for export.');
  const frame = document.createElement('iframe');
  frame.title = 'Preparing section image';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:1000px;border:0;pointer-events:none;`;
  try {
    await new Promise(resolve => {
      frame.onload = resolve;
      frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
      document.body.append(frame);
    });
    const doc = frame.contentDocument, view = frame.contentWindow;
    await Promise.all([...document.querySelectorAll('style,link[rel="stylesheet"]')].map(source => {
      const copy = source.cloneNode(true);
      if (source.tagName === 'LINK') {
        copy.href = source.href;
        return new Promise((resolve, reject) => {
          copy.onload = resolve;
          copy.onerror = () => reject(new Error('Section styles could not load. Please try again.'));
          doc.head.append(copy);
        });
      }
      doc.head.append(copy);
      return Promise.resolve();
    }));
    const copy = section.cloneNode(true);
    copy.querySelectorAll('[data-image-export-omit]').forEach(node => node.remove());
    copy.querySelectorAll('details').forEach(node => {node.open = true;});
    copy.querySelectorAll('[data-image-export-expand]').forEach(node => {
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('height', 'auto', 'important');
      node.style.setProperty('overflow', 'visible', 'important');
    });
    copy.style.margin = '0';
    copy.style.width = `${width}px`;
    copy.style.maxWidth = 'none';
    prepare?.(copy);
    doc.body.style.margin = '0';
    doc.body.append(copy);
    const noMotion = doc.createElement('style');
    noMotion.textContent = '* { animation:none!important; transition:none!important; caret-color:transparent!important; }';
    doc.head.append(noMotion);
    await doc.fonts.ready;
    // Measure and freeze CSS at the report width, including inherited fonts.
    copy.getBoundingClientRect();
    const snapshot = copy.cloneNode(true);
    const originals = [copy, ...copy.querySelectorAll('*')];
    const clones = [snapshot, ...snapshot.querySelectorAll('*')];
    originals.forEach((node, index) => {
      const style = view.getComputedStyle(node);
      for (const property of style) clones[index].style.setProperty(property, style.getPropertyValue(property));
    });
    // Table row groups and captions must size themselves after CSS is frozen:
    // assigning their computed heights can make collapsed-border rows overlap
    // the following section. Re-measure the final snapshot after this reflow.
    [snapshot, ...snapshot.querySelectorAll('[data-image-export-expand],table,caption,thead,tbody,tfoot,tr,th,td')].forEach(node => {
      node.style.height = 'auto';
      node.style.blockSize = 'auto';
    });
    copy.replaceWith(snapshot);
    const height = Math.ceil(snapshot.getBoundingClientRect().height);
    const xml = new XMLSerializer().serializeToString(snapshot);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const picture = new Image();
    await new Promise((resolve, reject) => {
      picture.onload = resolve;
      picture.onerror = () => reject(new Error('The section image could not render. Please try again.'));
      // A self-contained data URL keeps foreignObject rasterization usable on
      // the canvas; the snapshot needs no external stylesheets or fonts.
      picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement('canvas');
    const ratio = Math.min(pixelRatio, 16000 / width, 16000 / height);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser.');
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Section image export failed. Please try again.');
    return blob;
  } finally {frame.remove();}
}

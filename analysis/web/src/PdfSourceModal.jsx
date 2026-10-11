import React, {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {pdfSourceFromUrl} from './data.js';
import {openModalDialog} from './modalLifecycle.js';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));

export function PdfSourceLink({source, children, ...props}) {
  return source ? <a {...props} href={`${source.url}#page=${source.page}`} aria-haspopup="dialog" data-pdf-title={source.title}>{children}</a> : null;
}

function PdfDialog({source, onClose}) {
  const dialog = useRef(null);
  useEffect(() => openModalDialog(dialog.current), []);
  return createPortal(<dialog ref={dialog} className="analytics-dialog pdf-source-dialog" aria-label={`PDF source: ${source.document}`}
    onCancel={event => {event.preventDefault(); onClose();}}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <Suspense fallback={<div className="pdf-modal-loading"><p role="status">Loading PDF viewer…</p><button autoFocus onClick={onClose}>Close PDF viewer</button></div>}>
      <PdfPreview source={source} onClose={onClose} closeLabel="Close PDF viewer" downloadOriginal />
    </Suspense>
  </dialog>, document.body);
}

// A document listener also handles source anchors created by the retained
// hierarchy controllers. Downloads and non-PDF resource links stay native.
export default function PdfSourceModal() {
  const [source, setSource] = useState(null);
  useEffect(() => {
    const open = event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || event.button !== 0) return;
      const reference = pdfSourceFromUrl(anchor.href, anchor.dataset.pdfTitle || anchor.textContent.trim());
      if (!reference) return;
      event.preventDefault();
      setSource(reference);
    };
    const close = () => setSource(null);
    document.addEventListener('click', open, true);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('click', open, true);
      window.removeEventListener('hashchange', close);
    };
  }, []);
  return source && <PdfDialog source={source} onClose={() => setSource(null)} />;
}

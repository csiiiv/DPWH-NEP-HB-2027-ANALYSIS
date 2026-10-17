import React, {useEffect, useRef, useState} from 'react';
import {openModalDialog} from './modalLifecycle.js';

/** Copy text and flash a short confirmation (clipboard may be unavailable
 *  in insecure contexts; the fallback shows the URL to copy manually). */
async function copyText(text, setMessage) {
  try {await navigator.clipboard.writeText(text); setMessage('Link copied');}
  catch {setMessage('Copy the link below');}
}

/** Share menu for one card/section: copies a URL that opens the page with
 *  the item in view. `paramKey` picks the link form — `card` (default,
 *  `#…&card=<key>` scrolls to the card) or `section` (`#…&section=<key>`
 *  scrolls to a section anchor). Modal mode (`#…&modal=<key>`) opens the
 *  item centered, distraction-free. Copied links resolve the hash route
 *  against the current page URL so the clipboard carries the full address,
 *  not just the fragment. The menu closes on outside click, Escape, or
 *  focus leaving it. */
export function CardShareMenu({label, cardKey, routeBase, currentParams = {}, paramKey = 'card'}) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = e => {if (!ref.current?.contains(e.target)) setOpen(false);};
    const onKey = e => {if (e.key === 'Escape') setOpen(false);};
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey);};
  }, [open]);
  const buildHref = mode => {
    // Drop null/empty params *before* URLSearchParams — it would otherwise
    // stringify null as "null" and pollute the shared link.
    const entries = Object.entries({...currentParams, ...(mode === 'modal'
      ? {card: null, section: null, modal: cardKey}
      : {modal: null, card: paramKey === 'card' ? cardKey : null, section: paramKey === 'section' ? cardKey : null})})
      .filter(([, value]) => value != null && value !== '');
    const query = new URLSearchParams(entries).toString();
    return `${routeBase}${query ? '?' + query : ''}`;
  };
  // Absolute address for sharing: current origin/path/query + the hash route.
  const buildShareUrl = mode => new URL(buildHref(mode), window.location.href).href;
  const share = async mode => {
    setOpen(false);
    await copyText(buildShareUrl(mode), setMessage);
  };
  return <div className="card-share" ref={ref} aria-label={`Share ${label}`}>
    <button className="card-share-button" aria-expanded={open} aria-haspopup="true"
      aria-label={`Share ${label} card`} onClick={() => {setMessage(''); setOpen(o => !o);}}>Share</button>
    {message && <span role="status" className="card-share-status">{message}</span>}
    {open && <div className="card-share-menu" role="menu">
      <button role="menuitem" onClick={() => share('section')}>Link to section</button>
      <button role="menuitem" onClick={() => share('modal')}>Link as modal</button>
      <a role="menuitem" href={buildHref('section')}>Open section view</a>
      <a role="menuitem" href={buildHref('modal')}>Open modal view</a>
    </div>}
  </div>;
}

/** Section heading with a share affordance: `title` becomes the h2 labelled
 *  by `id`; `shareKey` is the value used in section=/modal= params, and the
 *  wrapping div gets `section-<shareKey>` as the scroll target for shared
 *  section links. Pass `share={false}` in modal presentations to omit the
 *  menu (and suffix the heading id) so the dialog stays a clean copy. */
export function SectionHeader({title, id, shareKey, routeBase = '#overview', currentParams = {}, share = true}) {
  return <div className="section-head" id={`section-${shareKey}`}>
    <h2 id={share ? id : `${id}-modal`}>{title}</h2>
    {share && <CardShareMenu label={title} cardKey={shareKey} routeBase={routeBase} currentParams={currentParams} paramKey="section"/>}
  </div>;
}

/** Route-driven card modal: renders `children` in a centered <dialog> when
 *  the URL carries modal=<cardKey>. Closing updates the route via
 *  `onClose(patch)` so share URLs stay bookmarkable and Back works.
 *  The heading doubles as the dialog's accessible name. */
export function CardModal({cardKey, active, label, onClose, children}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    document.title = `${label} · FY2027 Budget Workbenches`;
    return openModalDialog(ref.current);
  }, [active, label]);
  useEffect(() => {if (!active) document.title = 'Overview · FY2027 Budget Workbenches';}, [active]);
  if (!active) return null;
  return <dialog ref={ref} className="fmr-dialog card-modal" aria-label={label}
    onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{label}</h2><button onClick={onClose}>Close</button></div>
    {children}
  </dialog>;
}

import React,{useEffect,useRef} from 'react';
import {openModalDialog} from './modalLifecycle.js';

// Transient stand-in for modals whose data is still fetching (per-record
// payload, sidecars, lazy chunks). Rendered wherever the real modal would be,
// it swaps out in the same React commit that lands the data, so the
// backdrop/scroll-lock handoff via openModalDialog is seamless. Esc or Cancel
// closes it exactly like the real modal would.
export default function LoadingModal({eyebrow='LOADING',title,note,onClose}){
 const dialog=useRef(null);
 useEffect(()=>openModalDialog(dialog.current),[]);
 return <dialog ref={dialog} className="analytics-dialog loading-dialog" aria-labelledby="loading-dialog-title" aria-busy="true"
  onCancel={e=>{e.preventDefault();onClose?.();}}>
  <header className="analytics-header">
   <div className="analytics-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id="loading-dialog-title">{title}</h2></div>
    <button onClick={onClose} autoFocus aria-label="Cancel loading">Cancel</button></div>
  </header>
  <div className="analytics-content loading-dialog-content" role="status">
   <span className="loading-spinner" aria-hidden="true"></span>
   <p className="loading-dialog-note">{note}</p>
   <p className="muted">Heavy views open here once records arrive.</p>
  </div>
 </dialog>;
}

import React,{useEffect,useMemo,useRef} from 'react';
import {amount} from './model.js';
import {routeHref} from './routes.js';
import SortableTable from './SortableTable.jsx';
import {officeName,regionName} from './regionNames.js';
import {filterGroupProjects,compareHrefForGroup} from './groupProjects.js';

const amountCell=value=><span title={(value?.toLocaleString('en-PH')??'')+' PHP'}>{amount(value)}</span>;
const signedCell=value=><span className={value>0?'up':value<0?'down':''} title={(value?.toLocaleString('en-PH')??'')+' PHP'}>{value>0?'+':''}{amount(value)}</span>;

export default function GroupProjectsModal({projects,group,onClose,returnFocus}){
 const dialog=useRef(null);
 const rows=useMemo(()=>filterGroupProjects(projects,group),[projects,group]);
 const compareParams=useMemo(()=>compareHrefForGroup(group),[group]);
 useEffect(()=>{
  const element=dialog.current,previous=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return ()=>{element.close();document.body.style.overflow=previous;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
 },[]);
 const title=group.displayLabel||group.label;
 const houseKey=group.reading||'third';
 return <dialog ref={dialog} className="analytics-dialog group-projects-dialog" aria-labelledby="group-projects-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
  if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose();
 }}>
  <header className="analytics-header">
   <div className="analytics-heading"><div><p className="eyebrow">GROUP RECORDS</p><h2 id="group-projects-title">{title}</h2></div>
    <button onClick={onClose} autoFocus aria-label="Close group records">Close</button></div>
   <p>{rows.length.toLocaleString()} comparison rows in this group · same membership rules as the Analysis aggregate.</p>
   <div className="analytics-filter-tags" aria-label="Group filters">
    {group.scope==='insertions'&&<span>{group.ranking?.replaceAll('_',' ')}</span>}
    {group.scope==='differences'&&<span>House vs NEP differences</span>}
    {group.dim&&<span>{group.dim}: {title}</span>}
    <span>Region differences allowed and flagged</span>
   </div>
   <p className="muted"><a href={routeHref('compare',compareParams)}>Open closest filtered view in Compare stages →</a></p>
  </header>
  <div className="analytics-content group-projects-content">
   <SortableTable ariaLabel="Group project records" initialSort={{key:'amount_php',direction:'desc'}} rows={rows} empty="No comparison rows in this group." columns={[
    {key:'title',label:'Project',scope:'row',render:r=><span className="cell-main">{r.title}<small>{r.program} · {regionName(r.region)} · {officeName((r[houseKey]||r.third||r.second)?.office)||'No recorded office'} · {(r.trace||'').replaceAll('_',' ')}</small></span>},
    {key:'amount_php',label:'House',align:'num',value:r=>(r[houseKey]||r.third||r.second)?.amount_php,render:r=>{const v=(r[houseKey]||r.third||r.second)?.amount_php;return v!=null?amountCell(v):<span>—</span>;}},
    {key:'nep_php',label:'NEP',align:'num',value:r=>r.nep?.amount_php,render:r=>r.nep?amountCell(r.nep.amount_php):<span>—</span>},
    {key:'gap',label:'House − NEP',align:'num',value:r=>{const h=(r[houseKey]||r.third||r.second)?.amount_php;return h!=null&&r.nep!=null?h-r.nep.amount_php:null;},
     render:r=>{const h=(r[houseKey]||r.third||r.second)?.amount_php;return h!=null&&r.nep!=null?signedCell(h-r.nep.amount_php):<span>—</span>;}},
    {key:'review',label:'Review',sortable:false,render:r=><a href={routeHref('compare',{view:'projects',region_match:'ignore',q:r.id,record:r.id})}>Review comparison</a>},
   ]}/>
  </div>
 </dialog>;
}

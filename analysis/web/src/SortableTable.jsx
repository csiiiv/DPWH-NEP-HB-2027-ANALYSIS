import React,{useEffect,useMemo,useState} from 'react';
import {readRoute,routeHref} from './routes.js';
// Sortable data table used across Analysis views. Header cells are buttons
// with aria-sort; rows re-sort client-side without touching the data arrays.
// `columns`: [{key,label,align:'num'|null,sortable=true,render(row),value(row),
//              title}]; default sort falls back to column order.
// `tableId`: stable slug for deep links — renders a # anchor that adds
// table=<id> to the URL; Analysis scrolls the target into view on open.
// Missing values render as an em dash; numbers get grouped thousands.
// Controlled mode: pass `sort` + `onSortChange` and/or `page` + `onPageChange`
// to back sorting/pagination with route state (FMR tabs do this so a copied
// link restores the exact view). Without them, state stays internal (DPWH).
function formatCell(value){
 if(value==null||value==='')return '—';
 if(typeof value==='number')return value.toLocaleString('en-US');
 return value;
}
export default function SortableTable({columns,rows,initialSort,ariaLabel,empty,tableId,pageSize,sort:controlledSort,onSortChange,page:controlledPage,onPageChange}){
 const [internalSort,setInternalSort]=useState(initialSort||{key:columns.find(c=>c.sortable!==false)?.key,direction:'desc'});
 const sort=controlledSort!==undefined?controlledSort:internalSort;
 const [internalPage,setInternalPage]=useState(1);
 const page=controlledPage??internalPage;
 const rowIdentity=rows.map((r,i)=>r.id??i).join('\u001f');
 const setSort=next=>{if(onSortChange)onSortChange(next);else setInternalSort(next);};
 const setPage=next=>{if(onPageChange)onPageChange(next);else setInternalPage(next);};
 useEffect(()=>{if(controlledPage===undefined)setInternalPage(1);},[rowIdentity,sort?.key,sort?.direction,controlledPage]);
 // Reset only when the requested default changes, not when an inline object
 // is recreated during a parent render.
 useEffect(()=>{
  if(controlledSort===undefined)setInternalSort(initialSort||{key:columns.find(c=>c.sortable!==false)?.key,direction:'desc'});
 },[initialSort?.key,initialSort?.direction]);
 const sorted=useMemo(()=>{
  if(!sort?.key)return rows;
  const column=columns.find(c=>c.key===sort.key);
  const factor=sort.direction==='asc'?1:-1,value=column?.value||(row=>row[sort.key]);
  return [...rows].sort((a,b)=>{
   const x=value(a),y=value(b);
   // Missing values always sink to the bottom regardless of direction.
   if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
   if(typeof x==='number'&&typeof y==='number')return (x-y)*factor;
   return String(x).localeCompare(String(y),'en',{numeric:true,sensitivity:'base'})*factor;
  });
 },[rows,sort,columns]);
 function toggle(key){
  // Three-state cycle per column: initial direction → opposite → cleared.
  const initial=key==='title'||key==='label'?'asc':'desc';
  setSort(current=>!current||current.key!==key?{key,direction:initial}
   :current.direction===initial?{key,direction:initial==='asc'?'desc':'asc'}:null);
 }
 const pageCount=pageSize?Math.max(1,Math.ceil(sorted.length/pageSize)):1;
 const currentPage=Math.max(1,Math.min(page,pageCount));
 const visible=pageSize?sorted.slice((currentPage-1)*pageSize,currentPage*pageSize):sorted;
 const bandHeader=useMemo(()=>{
  if(!columns.some(c=>c.bandLabel))return null;
  const groups=[];
  for(const column of columns){
   const last=groups[groups.length-1];
   if(last && last.band===column.band){last.span++;continue;}
   groups.push({band:column.band||'',label:column.bandLabel||'',span:1,divider:Boolean(column.divider)});
  }
  return groups;
 },[columns]);
 const cellClass=column=>[column.align||'',column.band?`band-${column.band}`:'',column.divider?'col-divider':''].filter(Boolean).join(' ');
 // Optional per-column width hint (e.g. '1%' for rank columns) applied to the
 // header and body cells so narrow columns stay narrow in auto table layout.
 const cellStyle=column=>column.width?{width:column.width}:undefined;
 // # anchor: rewrites the current analysis hash with table=<id>, preserving
 // every other param (view, source, dim…) so the link is copy-paste ready.
 const linkTable=()=>{
  const {key,params}=readRoute();
  const next=Object.fromEntries(params);next.table=tableId;
  window.location.hash=routeHref(key,next);
 };
 const linked=Boolean(tableId);
 const targeted=linked&&readRoute().params.get('table')===tableId;
 return <><div id={linked?`table-${tableId}`:undefined} className={`sortable-table${bandHeader?' has-bands':''}${targeted?' table-target':''}`} role="region" aria-label={ariaLabel} tabIndex={0}>
  <table>
   <thead>
    {bandHeader&&<tr className="band-row">
     {/* The link column exists only in the column header row; emit a
         matching spacer so band labels align with their columns. */}
     {linked&&<th scope="col" className="table-link-col band-spacer" aria-hidden="true"></th>}
     {bandHeader.map((group,i)=>
     <th key={`${group.band||'g'}-${i}`} colSpan={group.span} scope="col"
      className={[group.band?`band-${group.band}`:'',group.divider?'col-divider':'',group.label?'':'band-spacer'].filter(Boolean).join(' ')}>
      {group.label||'\u00a0'}
     </th>)}</tr>}
    <tr>{linked&&<th scope="col" className="table-link-col"><button type="button" className="table-link" title={`Link to this table (${tableId})`} aria-label={`Copy link to ${ariaLabel}`} onClick={linkTable}>#</button></th>}
    {columns.map(column=><th key={column.key} scope="col" className={cellClass(column)} style={cellStyle(column)}
     aria-sort={sort?.key===column.key?(sort.direction==='asc'?'ascending':'descending'):'none'}>
     {column.sortable===false?<span className="th-label">{column.label}</span>
      :<button type="button" className="th-sort" onClick={()=>toggle(column.key)} title={column.title||`Sort by ${column.label}`}>
       <span className="th-label">{column.label}</span>
       <span className="sort-arrow" aria-hidden="true">{sort?.key===column.key?(sort.direction==='asc'?'▲':'▼'):''}</span>
      </button>}
    </th>)}</tr>
   </thead>
   <tbody>{visible.map((row,i)=><tr key={row.id??i}>{linked&&<td className="table-link-col"/>}{columns.map(column=>{
     const Tag=column.scope==='row'?'th':'td';
     return column.render
      ?<Tag key={column.key} data-label={column.label} className={cellClass(column)} style={cellStyle(column)}>{column.render(row,i)}</Tag>
      :<Tag key={column.key} data-label={column.label} className={cellClass(column)} style={cellStyle(column)}>{formatCell(column.value?column.value(row):row[column.key])}</Tag>;
   })}</tr>)}
    {!rows.length&&<tr><td colSpan={columns.length+(linked?1:0)}>{empty||'No rows.'}</td></tr>}
   </tbody>
  </table>
 </div>{pageSize&&<nav className="fmr-pagination" aria-label={`${ariaLabel} pages`}>
  <button disabled={currentPage===1} onClick={()=>setPage(p=>p-1)}>Previous</button>
  <span aria-live="polite">Page {currentPage} of {pageCount} · {sorted.length.toLocaleString()} rows</span>
  <button disabled={currentPage===pageCount} onClick={()=>setPage(p=>p+1)}>Next</button>
 </nav>}</>;
}

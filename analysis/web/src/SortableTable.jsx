import React,{useEffect,useMemo,useState} from 'react';
// Sortable data table used across Analysis views. Header cells are buttons
// with aria-sort; rows re-sort client-side without touching the data arrays.
// `columns`: [{key,label,align:'num'|null,sortable=true,render(row),value(row),
//              title}]; default sort falls back to column order.
// Missing values render as an em dash; numbers get grouped thousands.
function formatCell(value){
 if(value==null||value==='')return '—';
 if(typeof value==='number')return value.toLocaleString('en-US');
 return value;
}
export default function SortableTable({columns,rows,initialSort,ariaLabel,empty}){
 const [sort,setSort]=useState(initialSort||{key:columns.find(c=>c.sortable!==false)?.key,direction:'desc'});
 // Reset only when the requested default changes, not when an inline object
 // is recreated during a parent render.
 useEffect(()=>{
  setSort(initialSort||{key:columns.find(c=>c.sortable!==false)?.key,direction:'desc'});
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
 return <div className={`sortable-table${bandHeader?' has-bands':''}`} role="region" aria-label={ariaLabel} tabIndex={0}>
  <table>
   <thead>
    {bandHeader&&<tr className="band-row">{bandHeader.map((group,i)=>
     <th key={`${group.band||'g'}-${i}`} colSpan={group.span} scope="col"
      className={[group.band?`band-${group.band}`:'',group.divider?'col-divider':'',group.label?'':'band-spacer'].filter(Boolean).join(' ')}>
      {group.label||'\u00a0'}
     </th>)}</tr>}
    <tr>{columns.map(column=><th key={column.key} scope="col" className={cellClass(column)}
     aria-sort={sort?.key===column.key?(sort.direction==='asc'?'ascending':'descending'):'none'}>
     {column.sortable===false?<span className="th-label">{column.label}</span>
      :<button type="button" className="th-sort" onClick={()=>toggle(column.key)} title={column.title||`Sort by ${column.label}`}>
       <span className="th-label">{column.label}</span>
       <span className="sort-arrow" aria-hidden="true">{sort?.key===column.key?(sort.direction==='asc'?'▲':'▼'):''}</span>
      </button>}
    </th>)}</tr>
   </thead>
   <tbody>{sorted.map((row,i)=><tr key={row.id??i}>{columns.map(column=>{
     const Tag=column.scope==='row'?'th':'td';
     return column.render
      ?<Tag key={column.key} className={cellClass(column)}>{column.render(row,i)}</Tag>
      :<Tag key={column.key} className={cellClass(column)}>{formatCell(column.value?column.value(row):row[column.key])}</Tag>;
   })}</tr>)}
    {!rows.length&&<tr><td colSpan={columns.length}>{empty||'No rows.'}</td></tr>}
   </tbody>
  </table>
 </div>;
}

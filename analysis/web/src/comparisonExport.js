import {values} from './model.js';
export function exportResults(rows,finding,format){
 if(format==='json')return JSON.stringify({schema_version:1,amount_unit:'PHP',count_unit:'comparison_rows',source_record_count_unit:'allocation_records_per_source',finding,rows},null,2);
 const escape=value=>{let s=String(value??'');if(typeof value==='string' && /^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const headings=['ID','Title','Program','Region','Transparency PHP','NEP PHP','HGAB2 PHP','HGAB3 PHP','HGAB3 minus HGAB2 PHP','House reading status','Match status'];
 return [headings,...rows.map(r=>[r.id??r.source_id,r.title??r.label,r.program,r.region,...(finding.tab==='gaps'?[null,r.amount_php,null,null]:values(r,finding.tab)),r.reading_delta_php,r.reading_status,r.trace])].map(row=>row.map(escape).join(',')).join('\r\n');
}
// Filesystem-safe slug for one filter value: alphanumerics and dashes only,
// collapsed whitespace, capped per segment so long titles cannot blow up names.
function slug(value,max=40){
 return String(value??'').trim().replace(/\s+/g,'-').replace(/[^0-9A-Za-z_-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,max);
}
const FILTER_KEYS=[
 ['tab','view',null],['query','q',''],['program','program',''],
 ['region','region',''],['office','deo',''],['trace','match',''],
 ['readingStatus','reading',''],['regionMatching','regionmatch','strict'],
 ['column','sort','title'],['direction','dir','1'],
];
// Build a download name from the active (non-default) filters, e.g.
// dpwh-view-projects_q-bridge_reading-third_only.csv. Filters at their
// defaults are omitted; the view segment is always kept.
export function exportFileName(finding,format){
 const parts=[];
 for(const [key,label,def] of FILTER_KEYS){
  const value=slug(finding[key]);
  if(value && String(finding[key]??'')!==String(def))parts.push(`${label}-${value}`);
 }
 const stem=parts.length?`dpwh-${parts.join('_')}`:'dpwh-comparison-all';
 return `${stem}.${format}`;
}
export function downloadResults(rows,finding,format){
 const url=URL.createObjectURL(new Blob([exportResults(rows,finding,format)],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=exportFileName(finding,format);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

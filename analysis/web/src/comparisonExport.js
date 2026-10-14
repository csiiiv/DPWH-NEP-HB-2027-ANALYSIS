import {values} from './model.js';
import {sourcePdfPath} from './data.js';
const EVIDENCE_SIDES = [['nep','nep'],['house','house-third'],['house_second','house-projects'],['house_third','house-third']];
const EVIDENCE_KEYS = EVIDENCE_SIDES.flatMap(([side]) => [`${side}_source_id`,`${side}_source_pdf`,`${side}_pdf_page`]);
function evidenceFor(record, documentKey) {
 if(!record)return [null,null,null];
 const source=record.source || record;
 const members=record.records?.length ? record.records : [record];
 const pages=[...new Set(members.flatMap(r=>{
  const evidence=r.source || r;
  return evidence.pdf_pages || (evidence.pdf_page != null ? [evidence.pdf_page] : []);
 }).filter(p=>Number.isInteger(p)&&p>0))].sort((a,b)=>a-b);
 return [members.map(r=>r.source_record_id || r.id).filter(Boolean).join(','),
  source.source_pdf || sourcePdfPath(source.document_key || documentKey),pages.length ? pages.join(',') : null];
}
export function comparisonEvidence(row, finding) {
 const second=row.second || row.house;
 const house=row.third || second;
 const sides=[evidenceFor(finding.tab==='gaps' ? row : row.nep,'nep'),
  evidenceFor(house,row.third ? 'house-third' : 'house-projects'),
  evidenceFor(second,'house-projects'),evidenceFor(row.third,'house-third')];
 return Object.fromEntries(EVIDENCE_KEYS.map((key,i)=>[key,sides.flat()[i]]));
}
export function exportResults(rows,finding,format){
 if(format==='json')return JSON.stringify({schema_version:1,amount_unit:'PHP',count_unit:'comparison_rows',source_record_count_unit:'allocation_records_per_source',finding,
  rows:rows.map(r=>({...r,...comparisonEvidence(r,finding)}))},null,2);
 const escape=value=>{let s=String(value??'');if(typeof value==='string' && /^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const headings=['ID','Title','Program','Region','Transparency PHP','NEP PHP','HGAB2 PHP','HGAB3 PHP','HGAB3 minus HGAB2 PHP','House reading status','Match status',...EVIDENCE_KEYS];
 return [headings,...rows.map(r=>{const evidence=comparisonEvidence(r,finding);return [r.id??r.source_id,r.title??r.label,r.program,r.region,
  ...(finding.tab==='gaps'?[null,r.amount_php,null,null]:values(r,finding.tab==='readings'?'projects':finding.tab)),r.reading_delta_php,r.reading_status,r.trace,...EVIDENCE_KEYS.map(key=>evidence[key])];})].map(row=>row.map(escape).join(',')).join('\r\n');
}
// Filesystem-safe slug for one filter value: alphanumerics and dashes only,
// collapsed whitespace, capped per segment so long titles cannot blow up names.
function slug(value,max=40){
 return String(value??'').trim().replaceAll(':','-').replace(/\s+/g,'-').replace(/[^0-9A-Za-z_-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,max);
}
const FILTER_KEYS=[
 ['tab','view',null],['query','q',''],['program','program',''],
 ['region','region',''],['office','deo',''],
 ['matchStatus','match',''],['flag','flag',''],['trace','trace',''],
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

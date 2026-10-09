import {values} from './model.js';
export function exportResults(rows,finding,format){
 if(format==='json')return JSON.stringify({schema_version:1,amount_unit:'PHP',count_unit:'comparison_rows',source_record_count_unit:'allocation_records_per_source',finding,rows},null,2);
 const escape=value=>{let s=String(value??'');if(typeof value==='string' && /^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const headings=['ID','Title','Program','Region','Transparency PHP','NEP PHP','HGAB2 PHP','HGAB3 PHP','HGAB3 minus HGAB2 PHP','House reading status','Match status'];
 return [headings,...rows.map(r=>[r.id??r.source_id,r.title??r.label,r.program,r.region,...(finding.tab==='gaps'?[null,r.amount_php,null,null]:values(r,finding.tab)),r.reading_delta_php,r.reading_status,r.trace])].map(row=>row.map(escape).join(',')).join('\r\n');
}
export function downloadResults(rows,finding,format){
 const url=URL.createObjectURL(new Blob([exportResults(rows,finding,format)],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`dpwh-${finding.tab}-filtered.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

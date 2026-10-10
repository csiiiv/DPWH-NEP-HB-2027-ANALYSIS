import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {headlineStats} from './src/headlineStats.js';
import {unifiedComparison} from './src/unifiedComparison.js';
const fields=['id','source_record_id','native_node_id','title','title_match_key','title_base','title_base_match_key','chainages','chainage_incomplete','amount_php','program','pap','pap_id','zone','region','office','office_canonical','pdf_page','pdf_pages','record_kind','evidence','funding_php'];
function compactSource(source){
 if(!source)return null;
 const result=Object.fromEntries(fields.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
 if(source.records?.length>1)result.records=source.records.map(compactSource);
 return result;
}
export function comparisonPayloads(stages,readings){
 const unified=unifiedComparison(stages,readings);
 const projects=unified.projects.map(row=>{
  const result={...row};delete result.candidates;
  if(row.suggestions?.length)result.suggestions=row.suggestions.map(s=>({confidence:s.confidence,nep:compactSource(s.nep)}));else delete result.suggestions;
  for(const side of ['second','third','nep','api']){
   result[side]=compactSource(row[side]);
   if(result[side])for(const key of ['title','program','pap','zone','region'])if(result[side][key]!==undefined && result[side][key]===row[key]){(result[side].inherit??=[]).push(key);delete result[side][key];}
  }
  return result;
 });
 for(const side of ['second','third','nep','api']){
  if(projects.reduce((sum,r)=>sum+(r[side]?.amount_php || 0),0)!==unified.projects.reduce((sum,r)=>sum+(r[side]?.amount_php || 0),0))throw new Error('Compact comparison changed source totals');
 }
 return {overview:{schema_version:1,summary:stages.summary,readingSummary:readings.summary,headlines:headlineStats(unified.projects),paps:unified.paps,transparency_gaps:stages.transparency_gaps},detail:{schema_version:1,projects}};
}
export function buildComparisonData(){
 const data=new URL('../data/',import.meta.url),names=['stage_trace_2027.json','house_reading_changes_2027.json'];
 const raw=names.map(name=>readFileSync(new URL(name,data))),inputs=Object.fromEntries(names.map((name,i)=>[name,createHash('sha256').update(raw[i]).digest('hex')]));
 const {overview,detail}=comparisonPayloads(...raw.map(value=>JSON.parse(value)));
 for(const [name,payload] of [['comparison_overview_2027.json',overview],['comparison_projects_2027.json',detail]])writeFileSync(new URL(name,data),JSON.stringify({...payload,input_sha256:inputs})+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))buildComparisonData();

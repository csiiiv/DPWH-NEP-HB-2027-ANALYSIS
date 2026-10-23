// Independently sourced statutory/city benchmark against the provisional PSGC2LEG resolver.
// The generator reports failures; it never silently changes or upgrades the mapping.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {buildCrosswalk,resolveLocation,jurisdictionKey} from './lib.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const cases=read('sources/official_reference_cases.json');
const cross=buildCrosswalk({primary:read('sources/districts.json'),secondary:read('sources/districts_generated.json'),roster:JSON.parse(readFileSync(resolve(root,'../DEO2LEG/deo_leg_crosswalk.json'),'utf8'))});
const results=[];
for(const source of cases.sources){
 const jur=jurisdictionKey(source.jurisdiction);
 for(const [seat,places] of Object.entries(source.districts)){
  const expected='leg:'+jur.replace(/ /g,'-')+':'+seat;
  for(const place of places){
   const loc=source.level==='barangay'
    ? {municipality:source.jurisdiction,barangay:place}
    : {province:source.jurisdiction,municipality:place};
   const observed=resolveLocation(cross,loc);
   const outcome=observed.districtId===expected?'agreement'
     :observed.districtId?'wrong_assignment'
     :observed.status==='conflict'?'source_conflict'
     :observed.status==='unmatched_seat'?'unmatched_seat'
     :'unmapped';
   results.push({
    source:source.id,sourceUrl:source.url,scope:source.level,
    jurisdiction:source.jurisdiction,place,
    expectedDistrictId:expected,observedDistrictId:observed.districtId,
    verdict:outcome,lookupStatus:observed.status,
    candidates:observed.candidates,matchMethod:observed.matchMethod
   });
  }
 }
}
const counts=(rows)=>{
 const out={checked:rows.length,agreement:0,wrong_assignment:0,source_conflict:0,unmatched_seat:0,unmapped:0};
 for(const r of rows)out[r.verdict]++;
 return out;
};
const summary={...counts(results),bySource:Object.fromEntries(cases.sources.map(s=>[s.id,counts(results.filter(r=>r.source===s.id))]))};
const report={
 schemaVersion:"1.0.0",benchmarkDate:cases.verifiedOn,
 benchmarkScope:"Selected independent statutes and official city-government barangay classifications, not nationwide verification.",
 officialReferenceList:cases.sources.map(s=>({id:s.id,url:s.url,level:s.level,placeCount:results.filter(r=>r.source===s.id).length})),
 summary,findings:results
};
const result=JSON.stringify(report,null,2)+'\n';
const target=resolve(root,'outputs/official_crosscheck_report.json');
if(process.argv.includes('--check')){
 if(readFileSync(target,'utf8')!==result)throw Error('Official reference cross-check report drifted; regenerate');
 console.log('Official cross-check report current: '+JSON.stringify(summary));
}else{writeFileSync(target,result);console.log('Official cross-check report generated: '+JSON.stringify(summary));}

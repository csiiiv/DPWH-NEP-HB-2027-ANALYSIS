// Strict PSGC-code to geographic House legislative district lookup.
// Never falls back to fuzzy city/barangay matching or a DEO-to-seat association.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {tracePsgc} from './psgc_registry.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const registry=read('outputs/psgc_admin_registry_2026-10-12.json');
const mapping=read('outputs/psgc_to_leg_2025.json');
const roster=read('../DEO2LEG/deo_leg_crosswalk.json').legislativeDistricts;
export function lookupCode(code){
 const psgc=tracePsgc(registry,String(code));
 if(psgc.status!=='matched')return {status:psgc.status,psgcCode:String(code),districtId:null,psgc};
 const [id,assignmentStatus,sourceId]=mapping.records[code]??[null,'unmapped','missing_code_mapping'];
 const seat=id?roster[id]:null;
 return {status:assignmentStatus,psgcCode:String(code),psgc,legislativeDistrictId:id,
   evidenceSource:sourceId,districtName:seat?.displayName||null,
   districtJurisdiction:seat?.jurisdiction||null,
   representative:seat?.representative?.name||null,
   warning:id&&assignmentStatus.startsWith('provisional')?'Provisional, not independently verified electoral boundary':null};
}
export function lookupGeocoder(location){
 const code=location?.barangay_psgc??location?.barangayPsgc??location?.municipality_psgc??
  location?.city_psgc??location?.municity_psgc??null;
 if(code==null)return {status:'missing_psgc_code',legislativeDistrictId:null,
  reason:'Geocoder did not provide a supported PSGC code. Name guessing is disabled.'};
 return lookupCode(String(code));
}
export function audit(){
 return {coverage:mapping.coverage,lawLocationsNotMatched:mapping.diagnostics.sourceMembershipsWithoutMatchingPsgc,
   missingHouseDistricts:Object.keys(roster).filter(k=>!mapping.bySeat[k]),
   unmappedAndDisputed:Object.values(mapping.records).filter(x=>!x[0]&&x[1]!=='not_applicable').length};
}
const argv=process.argv.slice(2);
if(argv.length){
 let result;
 if(argv[0]==='--audit')result=audit();
 else if(argv[0]==='--geocoder'){
  if(!argv[1])throw Error('Supply path to CombinedPSGCGeomapper result JSON');
  result=lookupGeocoder(JSON.parse(readFileSync(resolve(process.cwd(),argv[1]),'utf8')));
 }else if(/^\d{10}$/.test(argv[0]))result=lookupCode(argv[0]);
 else throw Error('Usage: node PSGC2LEG/lookup_district.mjs <10-digit-PSGC-code> | --geocoder <geomapper.json> | --audit');
 console.log(JSON.stringify(result,null,2));
}

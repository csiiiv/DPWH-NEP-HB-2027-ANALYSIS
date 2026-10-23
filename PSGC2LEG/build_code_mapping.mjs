// Build versioned PSGC-code -> House legislative district assignments from independently
// sourced electoral geography, never from PSGC numeric prefixes or DEO associations.
// Legal fixture is presently PARTIAL: other assignments remain explicitly provisional.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCrosswalk,placeKey,jurisdictionKey} from './lib.mjs';
import {verifyRegistry,tracePsgc} from './psgc_registry.mjs';

const dir=dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(resolve(dir,p))).digest('hex');
const input={
 registry:'outputs/psgc_admin_registry_2026-10-12.json',
 primary:'sources/districts.json',
 secondary:'sources/districts_generated.json',
 legal:'sources/official_reference_cases.json',
 roster:'../DEO2LEG/deo_leg_crosswalk.json'
};
const CITY_TYPES=new Set(['component_city','highly_urbanized_city','independent_component_city','municipality']);
const normCity=(n)=>placeKey(n);
const districtKey=(jur,seat)=>'leg:'+jurisdictionKey(jur).replace(/ /g,'-')+':'+seat;
const legalTownAlias=(jur,n)=>{
 // Historical Baliuag municipality was converted to the City of Baliwag; explicit,
 // geography-scoped alias only, NOT global fuzzy name matching.
 if(jurisdictionKey(jur)==='bulacan' && normCity(n)==='baliuag')return 'baliwag';
 return normCity(n);
};
const validStatus=new Set([
 'verified_statute','verified_statute_inherited','provisional_correlated',
 'provisional_single','provisional_inherited','provisional_house_roster',
 'conflict','unmatched_seat','requires_barangay','unmapped','not_applicable'
]);
export function buildCodeMapping({registry,primary,secondary,legal,roster}){
 verifyRegistry(registry,{strict2026:true});
 const districts=roster.legislativeDistricts;
 const canonical=new Set(Object.keys(districts));
 const provisional=buildCrosswalk({primary,secondary,roster});
 const legalMunicipal=new Map(),legalBarangay=new Map();
 const diagnostics={sourceMembershipsWithoutMatchingPsgc:[],duplicateOfficialAssignments:[],secondaryHints:[]};
 const sampleFound=new Map();
 const seatId=(jur,seat)=>{
  const id=districtKey(jur,seat);
  if(!canonical.has(id))throw Error('Statute references a seat outside DEO2LEG: '+id);
  return id;
 };
 for(const s of legal.sources){
  if(!/^RA\d+$/.test(s.id))continue;
  const jur=jurisdictionKey(s.jurisdiction);
  const target=s.level==='municipality'?legalMunicipal:
               s.level==='barangay'?legalBarangay:null;
  if(!target)continue;
  for(const [seat,names] of Object.entries(s.districts)){
   const id=seatId(s.jurisdiction,seat);
   for(const name of names){
    const location=target===legalMunicipal?legalTownAlias(s.jurisdiction,name):normCity(name);
    const key=jur+'|'+location;
    const prev=target.get(key);
    if(prev && prev.districtId!==id) {
      diagnostics.duplicateOfficialAssignments.push({key,first:prev,second:{districtId:id,source:s.id}});
      throw Error('Contradictory statutory fixture '+key);
    }
    target.set(key,{districtId:id,source:s.id,url:s.url,effectiveElection:s.effectiveElection});
    sampleFound.set(s.id+'|'+key,false);
   }
  }
 }
 const townRecords=new Map(),out={},unresolved={};
 const counts={};
 const getStatus=(entry)=>entry?.status==='corroborated_provisional'?'provisional_correlated':
  entry?.status==='single_source_provisional'?'provisional_single':
  entry?.status==='conflict'?'conflict':
  entry?.status==='unmatched_seat'?'unmatched_seat':'unmapped';
 const write=(code,id,status,source,candidates=[])=>{
  if(!validStatus.has(status))throw Error('Bad status '+status);
  if(id && !canonical.has(id))throw Error('Unknown district '+id+' for PSGC '+code);
  if(status==='conflict'||status==='unmatched_seat'||status==='requires_barangay'||status==='unmapped'||status==='not_applicable')id=null;
  out[code]=[id,status,source];
  counts[status]=(counts[status]||0)+1;
  if(!id && candidates.length)unresolved[code]=candidates;
 };
 function fallbackForTown(trace){
  const city=trace.cityMunicipality,province=trace.province;
  if(!city)return {id:null,status:'unmapped',source:'no_administrative_city'};
  const cityJur=jurisdictionKey(city.name),provJur=province?jurisdictionKey(province.name):'';
  const pk=normCity(city.name);
  const entry=provJur?provisional.municipalities[provJur+'|'+pk]:null;
  if(entry) return {id:entry.districtId,status:getStatus(entry),source:'bettergov_municipality',candidates:entry.candidates};
  const lone=provisional.cities[cityJur];
  if(lone)return {id:lone.districtId,status:'provisional_house_roster',source:'deo2leg_roster_only'};
  // A city with several House seats MUST be assigned at barangay level.
  if(Object.keys(districts).some(id=>jurisdictionKey(districts[id].jurisdiction)===cityJur)){
   return {id:null,status:'requires_barangay',source:'city_house_seats'};
  }
  return {id:null,status:'unmapped',source:'no_electoral_membership'};
 }
 const codes=Object.keys(registry.records).sort();
 // Stage 1: assign locality-level seats. Treat HUCs without a province as independent.
 for(const code of codes){
  const [name,kind]=registry.records[code];
  if(!CITY_TYPES.has(kind))continue;
  const t=tracePsgc(registry,code);
  if(t.status!=='matched')throw Error('Invalid PSGC chain '+code);
  const p=t.province?jurisdictionKey(t.province.name):'';
  const local=normCity(name);
  const key=p+'|'+local;
  const law=legalMunicipal.get(key);
  if(law){
   const k=law.source+'|'+key;sampleFound.set(k,true);
   townRecords.set(code,{id:law.districtId,status:'verified_statute',source:law.source});
   write(code,law.districtId,'verified_statute',law.source);
  }else{
   const fallback=fallbackForTown(t);
   townRecords.set(code,fallback);
   write(code,fallback.id,fallback.status,fallback.source,fallback.candidates);
  }
 }
 // Stage 2: assign ALL 42,010 barangays by code and administrative parent.
 for(const code of codes){
  const [name,kind]=registry.records[code];
  if(kind!=='barangay')continue;
  const t=tracePsgc(registry,code);
  const city=t.cityMunicipality;
  if(!city) {write(code,null,'unmapped','missing_psgc_city_parent');continue;}
  const cityJur=jurisdictionKey(city.name);
  const bg=normCity(name);
  const cityKey=cityJur+'|'+bg;
  const law=legalBarangay.get(cityKey);
  if(law){
   sampleFound.set(law.source+'|'+cityKey,true);
   write(code,law.districtId,'verified_statute',law.source);
   continue;
  }
  const town=townRecords.get(city.code);
  if(town?.id){
   const status=town.status==='verified_statute'?'verified_statute_inherited':'provisional_inherited';
   write(code,town.id,status,town.source);continue;
  }
  const entry=provisional.barangays[cityKey];
  if(entry){
   write(code,entry.districtId,getStatus(entry),'bettergov_barangay',entry.candidates);
  }else{
   write(code,null,town?.status==='requires_barangay'?'requires_barangay':'unmapped',
    town?.status==='requires_barangay'?'multi_district_city':'no_electoral_membership');
  }
 }
 // Other PSGC levels are in the output, but never get a House district ID directly.
 for(const code of codes){
  if(!Object.prototype.hasOwnProperty.call(out,code))write(code,null,'not_applicable','psgc_administrative_level');
 }
 for(const [key,found] of sampleFound){
  if(!found)diagnostics.sourceMembershipsWithoutMatchingPsgc.push(key);
 }
 if(Object.keys(out).length!==codes.length)throw Error('Code coverage count drift');
 const bySeat={};
 for(const [code,row] of Object.entries(out))if(row[0]){
  const id=row[0];const v=bySeat[id]??={totalCodes:0,verifiedCodes:0,provisionalCodes:0};
  v.totalCodes++;
  if(row[1].startsWith('verified'))v.verifiedCodes++;
  else v.provisionalCodes++;
 }
 const classified=Object.values(out).filter(v=>v[0]).length;
 const official=Object.values(out).filter(v=>v[0]&&v[1].startsWith('verified')).length;
 return {
  schemaVersion:'1.0.0',asOfElection:2025,registryVintage:registry.provenance.authoritativeRelease,
  warnings:[
   'PSGC administrative registry is a pinned 2026-10-12 community mirror, pending byte comparison to original PSA 2026 Q3 workbook.',
   'Only enumerated RA statutory source rows are law-backed; unresolved and BetterGov-only mappings are NOT authoritative.',
   'Quezon City councilor-district fixtures are held as secondary review evidence; not silently treated as congressional membership.',
   'No project ownership/sponsorship inference. No automated cost splitting across districts.'
  ],
  sourceSha256:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,hash(v)])),
  statusCodes:{
   verified_statute:'Explicit location assignment stated in cited reapportionment law',
   verified_statute_inherited:'Barangay inherits cited law assignment covering entire municipality/city',
   provisional_correlated:'Two related BetterGov research snapshots agree, not independent verification',
   provisional_single:'One related BetterGov research snapshot, not verified',
   provisional_inherited:'Barangay inherits unverified town/city mapping',
   provisional_house_roster:'Lone House seat inferred from canonical roster; geography unverified',
   conflict:'Candidate district IDs disagree',unmatched_seat:'Source seat alias unrecognized',
   requires_barangay:'Multi-district jurisdiction needs a barangay',
   unmapped:'Electoral geography unknown',
   not_applicable:'Higher administrative layer, not direct congressional locality'
  },
  coverage:{
   administrativeCodes:codes.length,barangayCodes:counts.verified_statute+counts.verified_statute_inherited+
   counts.provisional_correlated+counts.provisional_single+counts.provisional_inherited+
   counts.conflict+counts.unmatched_seat+counts.requires_barangay+counts.unmapped-
   [...townRecords.values()].length,
   municipalityCityCodes:townRecords.size,
   resolvedPsgcCodes:classified,lawBackedPsgcCodes:official,
   mappedHouseDistricts:Object.keys(bySeat).length,rosterHouseDistricts:canonical.size,
   countsByStatus:counts
  },
  diagnostics,bySeat,unresolvedCandidates:unresolved,records:out
 };
}
export function main(){
 const args=new Set(process.argv.slice(2));
 const registry=read(input.registry);
 const data=buildCodeMapping({
  registry,
  primary:read(input.primary),
  secondary:read(input.secondary),
  legal:read(input.legal),
  roster:read(input.roster)
 });
 // Derive the barangay count from the *administrative* input, not assigned seats.
 const expected=Object.values(registry.records).filter(v=>v[1]==='barangay').length;
 data.coverage.barangayCodes=expected;
 const target=resolve(dir,'outputs/psgc_to_leg_2025.json');
 const result=JSON.stringify(data,null,2)+'\n';
 if(args.has('--check')){
  if(readFileSync(target,'utf8')!==result)throw Error('PSGC → LEG published mapping is stale; regenerate');
  console.log('Generated PSGC2LEG mapping matches committed output');
 }else{
  writeFileSync(target,result);
  console.log(JSON.stringify({file:target,coverage:data.coverage,unmatchedLawLocations:data.diagnostics.sourceMembershipsWithoutMatchingPsgc.length},null,2));
 }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1]))main();

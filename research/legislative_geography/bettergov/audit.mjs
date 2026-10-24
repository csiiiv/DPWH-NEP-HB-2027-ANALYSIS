#!/usr/bin/env node
/* BetterGov legislative geography: pinned-source audit, NOT a production crosswalk.
 * Node 22+ (no third-party dependencies).
 * Usage: node audit.mjs [--check] [--source-dir /path/to/mirrors]
 */
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(root,"source_manifest.json"),"utf8"));
const sourceDir=(()=>{const i=process.argv.indexOf("--source-dir");return i===-1?null:process.argv[i+1];})();
if(process.argv.includes("--source-dir")&&!sourceDir)throw Error("--source-dir expects a folder path");
async function loadPinned(file){
 const url="https://raw.githubusercontent.com/"+manifest.repository+"/"+manifest.upstreamCommit+"/"+file.path;
 const input=sourceDir?readFileSync(resolve(sourceDir,file.path)):Buffer.from(await (async()=>{const r=await fetch(url);if(!r.ok)throw Error("Cannot fetch "+file.path+": "+r.status);return r.arrayBuffer();})());
 const digest=createHash("sha1").update(Buffer.from("blob "+input.length+"\0")).update(input).digest("hex");
 if(digest!==file.gitBlobSha1)throw Error("Git blob SHA mismatch for "+file.path+" expected "+file.gitBlobSha1+" got "+digest);
 return JSON.parse(input.toString("utf8"));
}
function buildAudit({primary,generated,hierarchy,reps}){
 const districts=primary.districts||{};
 const nonParty=Object.entries(districts).filter(([name,rec])=>rec.entity_type!=="partylist"&&!/party[\s-]*list/i.test(name));
 const primaryMunicipalities=nonParty.reduce((n,[j,x])=>n+Object.keys(x.municipalities||{}).length,0);
 const primaryBarangayRows=nonParty.reduce((n,[j,x])=>n+Object.values(x.barangays||{}).reduce((z,arr)=>z+(Array.isArray(arr)?arr.length:0),0),0);
 const generatedRows=Object.values(generated).reduce((n,x)=>n+Object.keys(x).length,0);
 const nested=Object.entries(generated).flatMap(([parent,towns])=>Object.entries(towns).filter(([name,x])=>x&&typeof x==="object"&&x.is_mixed===true&&x.barangays).map(([name,obj])=>({parent,name,barangays:obj.barangays})));
 const hCities=Object.values(hierarchy).flatMap(x=>Object.entries(x));
 const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^city of /,"").replace(/ city$/,"").replace(/[^a-z0-9]/g,"");
 const electionCities=new Map(nested.map(x=>[norm(x.name),new Map(Object.entries(x.barangays).map(([n,v])=>[norm(n),v]))]));
 const conflicts=[];
 for(const [jur,record] of nonParty){
   const listings=new Map();
   for(const [district,names] of Object.entries(record.barangays||{}))if(Array.isArray(names))for(const name of names){
      const key=String(name).trim().toLowerCase();
      if(!listings.has(key))listings.set(key,{name,allSeats:new Set(),count:0});
      listings.get(key).allSeats.add(district);listings.get(key).count++;
   }
   for(const [key,item] of listings)if(item.allSeats.size>1){
     const electionCandidate=electionCities.get(norm(jur))?.get(norm(item.name))||null;
     conflicts.push({jurisdiction:jur,barangay:item.name,sourceDistrictLabels:[...item.allSeats].sort(),electionDerivedLabel:electionCandidate,provisionalOnly:true,status:"needs_official_congressional_district_verification"});
   }
 }
 conflicts.sort((a,b)=>a.jurisdiction.localeCompare(b.jurisdiction,"en")||a.barangay.localeCompare(b.barangay,"en"));
 const byJurisdiction={};
 for(const x of conflicts)byJurisdiction[x.jurisdiction]=(byJurisdiction[x.jurisdiction]||0)+1;
 const butuan=generated["Agusan Del Norte"]?.["City Of Butuan"]??null;
 return {
  schemaVersion:"1.0.0",scope:"source_artifact_inventory_not_production_crosswalk",
  measurements:{
   sourceMetadataDate:primary.metadata?.date??null,sourceClaimsTotalDistricts:primary.metadata?.total_districts??null,
   primaryJurisdictionKeys:nonParty.length,primaryMunicipalityLabelRows:primaryMunicipalities,primaryCityBarangayLabelRows:primaryBarangayRows,
   generatedTopLevelKeys:Object.keys(generated).length,generatedLocalityRows:generatedRows,
   generatedMixedCityEntries:nested.length,generatedMixedCityBarangayRows:nested.reduce((n,x)=>n+Object.keys(x.barangays).length,0),
   hierarchyProvinceGroupings:Object.keys(hierarchy).length,hierarchyCityKeys:hCities.length,
   hierarchyBarangayNameRows:hCities.reduce((n,[key,arr])=>n+(Array.isArray(arr)?arr.length:0),0),
   representativeRows:Array.isArray(reps)?reps.length:null,
   conflictingPrimaryCityBarangayKeys:conflicts.length,conflictsWithElectionDerivedCandidate:conflicts.filter(x=>x.electionDerivedLabel!==null).length
  },
  discrepancies:{
   catalogClaimedDistricts:256,psaOfficialHouseDistricts:254,
   catalogClaimed85Provinces:"source page says 85 provincial groupings; file hierarchy has separate counts and cannot be equated to provinces",
   rawCityHierarchyNotHouseDistricts:true,
   generatedButuanUnderAgusanDelNorte:butuan,
   generatedButuanNeedsReview:butuan!==null,
   examplesOfNotAutomaticallyResolved:["Butuan's separate legislative seat (2025), under Agusan Del Norte in election-generated tree.","Conflicting named barangays in Cebu City, Quezon City, Zamboanga City, and other cities."]
  },
  byJurisdiction,conflicts,
  requirements:["Use latest PSA PSGC for administrative identities and parent relationships.","Use COMELEC direct congressional district geography and dated reapportionment laws for verified constituency links.","Treat generated House election contest labels as candidates, not authoritative boundaries until complete and reviewed.","Never interpret councilor district as a House district.","Never use DEO associations to infer House project attribution.","Never count location coverage as congressional seat coverage."]
 };
}
const dataset={};
for(const f of manifest.pinnedFiles)dataset[f.path]=await loadPinned(f);
const report=buildAudit({primary:dataset["static/data/districts.json"],generated:dataset["static/data/districts_generated.json"],hierarchy:dataset["city_barangays_mapping.json"],reps:dataset["static/data/20th_congress_representatives.json"]});
report.upstream={repository:manifest.repository,commit:manifest.upstreamCommit,sourcePage:manifest.sourcePage,sourceHashes:Object.fromEntries(manifest.pinnedFiles.map(x=>[x.path,x.gitBlobSha1]))};
report.officialControl=manifest.officialControl;
const json=JSON.stringify(report,null,2)+"\\n";
const out=resolve(root,"audit_report.json");
if(process.argv.includes("--check")){
 if(!existsSync(out)||readFileSync(out,"utf8")!==json)throw Error("Audit output drift: regenerate with node audit.mjs");
 console.log("BetterGov source audit unchanged:",JSON.stringify(report.measurements));
}else{
 writeFileSync(out,json);
 console.log("Published BetterGov source audit:",JSON.stringify(report.measurements));
}

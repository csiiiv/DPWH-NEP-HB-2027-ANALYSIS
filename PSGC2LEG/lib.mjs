// PSGC2LEG geographic research crosswalk. Pure functions; no network or external dependencies.
// Generated source definitions are exactly those used to produce the committed JSON.
function nameKey(raw){
 return String(raw??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[‘’'`]/g,"").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function placeKey(raw){
 let s=nameKey(raw);
 if(s.startsWith("city of "))s=s.slice(8);
 if(s.endsWith(" city"))s=s.slice(0,-5);
 return s;
}
function jurisdictionKey(raw){
 let k=nameKey(raw);
 const aliases={
  "antipolo":"antipolo city","cagayan de oro":"cagayan de oro city",
  "caloocan":"caloocan city","malabon":"malabon city",
  "navotas":"navotas city","pasay":"pasay city","pasig":"pasig city",
  "san juan":"san juan city","valenzuela":"valenzuela city",
  "taguig pateros":"taguig city pateros","las pinas":"las pinas city",
  "butuan city":"butuan","manila city":"manila",
  "city of quezon":"quezon city",
  "city of cebu":"cebu city",
  "city of davao":"davao city",
  "city of zamboanga":"zamboanga city",
  "city of makati":"makati city"
 };
 return aliases[k]??k;
}
function seatKey(raw){
 const s=nameKey(raw);
 if(/\blone\b/.test(s))return "lone";
 const m=s.match(/\b([1-9])(st|nd|rd|th)\b/);
 if(m)return m[1]+m[2];
 const word={first:"1st",second:"2nd",third:"3rd",fourth:"4th",fifth:"5th",sixth:"6th",seventh:"7th",eighth:"8th"};
 for(const [k,v] of Object.entries(word))if(new RegExp(`\\b${k}\\b`).test(s))return v;
 return null;
}
function buildCrosswalk(input){
 const main=input.primary.districts||input.primary, generated=input.secondary, roster=input.roster.legislativeDistricts;
 const byJurSeat=new Map(), byJur=new Map(), rosterIds=new Set(Object.keys(roster));
 for(const [id,d] of Object.entries(roster)){
   const j=jurisdictionKey(d.jurisdiction), seat=seatKey(d.districtLabel);
   if(!j||!seat)continue;
   byJurSeat.set(j+"|"+seat,id);
   if(!byJur.has(j))byJur.set(j,[]);
   byJur.get(j).push(id);
 }
 const raw={municipalities:{},barangays:{}};
 const skipped=[],sourceCount={primary:0,generated:0};
 function seatId(jur,rawseat){
    const seat=seatKey(rawseat);
    let j=jurisdictionKey(jur);
    if(j==="taguig city pateros"&&seat==="2nd")j="taguig city";
    if(j==="taguig city pateros"&&seat==="1st")return byJurSeat.get("taguig city pateros|lone")||null;
    return byJurSeat.get(j+"|"+seat)||null;
 }
 function add(kind,jur,locality,seat,source){
    if(!locality||!seat||!jur)return;
    const j=jurisdictionKey(jur), local=placeKey(locality),k=j+"|"+local;
    if(!j||!local)return;
    const districtId=seatId(jur,seat);
    (raw[kind][k]??=[]).push({source,seat:String(seat),districtId});
    sourceCount[source]++;
    if(!districtId&&skipped.length<500)skipped.push({kind,jurisdiction:jur,locality,seat,source});
 }
 for(const [jur,data] of Object.entries(main)){
    if(!data||typeof data!=="object"||data.entity_type==="partylist"||/party[\s-]*list/i.test(jur))continue;
    for(const [town,seat] of Object.entries(data.municipalities||{})) {
      if(typeof seat==="string"&&seat!=="Nationwide")add("municipalities",jur,town,seat,"primary");
    }
    for(const [seat,bgs] of Object.entries(data.barangays||{})){
      if(Array.isArray(bgs))for(const bg of bgs)if(typeof bg==="string")add("barangays",jur,bg,seat,"primary");
    }
 }
 for(const [jur,towns] of Object.entries(generated)){
    if(!towns||typeof towns!=="object")continue;
    for(const [town,value] of Object.entries(towns)){
      if(typeof value==="string")add("municipalities",jur,town,value,"generated");
      if(value&&typeof value==="object"&&value.barangays){
        for(const [brgy,seat] of Object.entries(value.barangays)){
          if(typeof seat==="string")add("barangays",town,brgy,seat,"generated");
        }
      }
    }
 }
 function finalize(entries){
   const out={},stat={corroborated_provisional:0,single_source_provisional:0,conflict:0,unmatched_seat:0};
   for(const key of Object.keys(entries).sort()){
      const rows=entries[key],sourceNames=[...new Set(rows.map(r=>r.source))].sort();
      const candidates=[...new Set(rows.map(r=>r.districtId).filter(Boolean))].sort();
      const unmatched=rows.some(r=>!r.districtId),mult=candidates.length>1;
      const status=mult?"conflict":unmatched?"unmatched_seat":sourceNames.length===2?"corroborated_provisional":"single_source_provisional";
      const districtId=(mult||unmatched)?null:(candidates[0]||null);
      stat[status]++;
      out[key]={districtId,status,candidates,sourceNames,observations:rows.length};
   }
   return {out,stat};
 }
 const m=finalize(raw.municipalities),b=finalize(raw.barangays);
 const cities={};
 const explicitCityAliases=new Set(["butuan","malabon city","navotas city","pasay city","pasig city","san juan city"]);
 const sourceCityNames=new Set(Object.entries(main).filter(([j,d])=>d&&typeof d==="object"&&d.barangays).map(([j])=>jurisdictionKey(j)));
 for(const [jur,ids] of byJur){
   if(ids.length!==1||seatKey(roster[ids[0]].districtLabel)!=="lone")continue;
   if(!jur.includes("city")&&!sourceCityNames.has(jur)&&!explicitCityAliases.has(jur))continue;
   cities[jur]={districtId:ids[0],status:"roster_lone_district",candidates:ids,sourceNames:["house_roster"],observations:1};
 }
 const output={
  schemaVersion:"0.1.0",status:"provisional_geographic_crosswalk",
  description:"Research PSGC-to-legislative-district bridge from named administrative locations. No PSGC numeric codes are asserted until a versioned PSGC gazetteer is supplied. A geographic match is NOT evidence of legislative sponsorship or control.",
  metadata:{
    assembledFrom:["BetterGov districts.json (blob d3efd8ea21f3c6e274046c12fe9eaeac4efafc3d)","BetterGov districts_generated.json (blob ebaf4f220e13e57b399a5fa9efa7c7e05f16307e)","DEO2LEG legislativeDistricts (schema 2.1.0)"],
    boundaryVintage:"unverified",psgcCodeVintage:null,geographicLevel:"city/municipality or barangay; NOT surveyed electoral polygons",
    sourceRows:sourceCount,summary:{municipalities:m.stat,barangays:b.stat,loneDistrictCities:Object.keys(cities).length,unmatchedExampleCount:skipped.length},
    warnings:["The two BetterGov files are related research artifacts, NOT independent official verification.","Municipality/barangay assignments are provisional and may be stale or duplicated.","Source district identifiers have been matched to the 20th Congress DEO2LEG roster, which is not a legislative boundary proof.","2023 PSGC geometry and later PSGC code versions must be reconciled separately.","No money or project ownership should be allocated from DEO2LEG office associations."]
  },municipalities:m.out,barangays:b.out,cities,byPsgcCode:{}
 };
 return output;
}
function resolveLocation(cross,location){
 const municipality=location.municipality??location.city??location.municity??"",province=location.province??"",barangay=location.barangay??"";
 const mcCode=String(location.municipality_psgc??location.city_psgc??location.municity_psgc??"").trim();
 const bgCode=String(location.barangay_psgc??"").trim();
 let entry=null,method="none";
 if(bgCode&&cross.byPsgcCode?.[bgCode]){entry=cross.byPsgcCode[bgCode];method="barangay_psgc";}
 else if(mcCode&&cross.byPsgcCode?.[mcCode]){entry=cross.byPsgcCode[mcCode];method="municipality_psgc";}
 else{
  const city=jurisdictionKey(municipality),town=placeKey(municipality),prov=jurisdictionKey(province);
  const seats=Object.keys(cross.cities||{});
  const cityKey=Object.keys(cross.barangays||{}).some(k=>k.startsWith(city+"|"));
  if(barangay&&(cityKey||cross.cities?.[city])){
    entry=cross.barangays?.[city+"|"+placeKey(barangay)]||null;
    if(entry)method="city_barangay_name";
  }
  if(!entry&&cross.cities?.[city]){entry=cross.cities[city];method="single_seat_city_name";}
  if(!entry&&(!cityKey||!barangay)){entry=cross.municipalities?.[prov+"|"+town]||null;if(entry)method="province_municipality_name";}
  if(!entry&&cityKey&&!barangay)return {districtId:null,status:"requires_barangay",matchMethod:"city_multidistrict",candidates:[]};
 }
 if(!entry)return {districtId:null,status:"unmapped",matchMethod:method,candidates:[]};
 return {districtId:entry.districtId,status:entry.status,matchMethod:method,candidates:entry.candidates||[],sourceNames:entry.sourceNames||[]};
}
function materializePsgcCodes(cross,gazetteer){
 const output={...cross,byPsgcCode:{}};
 const collisions=[];
 for(const row of gazetteer){
   const r=resolveLocation(cross,row);
   for(const field of ["municipality_psgc","barangay_psgc"]){
      const code=String(row[field]??"").trim();
      if(!code||!/^\d{6,12}$/.test(code))continue;
      if(field==="municipality_psgc"&&r.matchMethod==="city_barangay_name")continue;
      if(field==="barangay_psgc"&&r.matchMethod==="province_municipality_name"&&row.barangay==null)continue;
      if(field==="barangay_psgc"&&r.matchMethod==="none")continue;
      const prev=output.byPsgcCode[code];
      if(prev&&(prev.districtId!==r.districtId||prev.status!==r.status)){
        output.byPsgcCode[code]={districtId:null,status:"psgc_code_conflict",candidates:[...new Set([...(prev.candidates||[]),...(r.candidates||[])])].sort()};
        collisions.push(code);
      }else if(!prev)output.byPsgcCode[code]={districtId:r.districtId,status:r.status,candidates:r.candidates,sourceNames:r.sourceNames};
   }
 }
 output.metadata={...cross.metadata,psgcCodeVintage:"external_gazetteer_version_must_be_supplied",psgcCodesCount:Object.keys(output.byPsgcCode).length,psgcCodeConflicts:[...new Set(collisions)].sort()};
 return output;
}
export {nameKey,placeKey,jurisdictionKey,seatKey,buildCrosswalk,resolveLocation,materializePsgcCodes};

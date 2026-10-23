// PSGC administration registry (strict code-keyed traversal, separate from Congress districts).
// Every record has [name,type,parentPsgcCode]. Names are never unique identifiers.
const TYPES=new Set(['region','province','highly_urbanized_city','independent_component_city','component_city','municipality','submunicipality','special_geographic_area','barangay']);
const CITY_TYPES=new Set(['highly_urbanized_city','independent_component_city','component_city','municipality']);
export function verifyRegistry(registry,{strict2026=false}={}){
 if(!registry||!registry.records||!registry.provenance)throw Error('Missing versioned PSGC registry');
 const rows=registry.records,counts={},codes=new Set(Object.keys(rows)),errors=[];
 for(const [code,entry] of Object.entries(rows)){
  if(!/^\d{10}$/.test(code)||!Array.isArray(entry)||entry.length!==3)errors.push('Malformed entry: '+code);
  const [name,kind,parent]=entry||[];
  if(!name||!TYPES.has(kind))errors.push('Invalid name/type: '+code);
  counts[kind]=(counts[kind]||0)+1;
  if(kind==='region'&&parent!=='0000000000')errors.push('Region parent: '+code);
  if(kind!=='region'&&!codes.has(parent))errors.push('Missing parent: '+code+' -> '+parent);
 }
 if(strict2026){
  for(const [key,target] of Object.entries({region:18,province:82,municipality:1493,barangay:42010})){
   if(counts[key]!==target)errors.push(key+' count '+counts[key]+' != '+target);
  }
 }
 if(errors.length)throw Error(errors.slice(0,30).join('; '));
 return {total:codes.size,counts};
}
export function tracePsgc(registry,code){
 const records=registry.records;
 if(!/^\d{10}$/.test(String(code)))return {status:'invalid_code',code:String(code)};
 if(!records[code])return {status:'unknown_code',code:String(code),release:registry.provenance.authoritativeRelease};
 const chain=[],visited=new Set();let current=code;
 while(current!=='0000000000'){
  if(!records[current]||visited.has(current))return {status:'invalid_parent_chain',code:String(code),chain};
  visited.add(current);
  const [name,type,parentPsgcCode]=records[current];
  chain.unshift({code:current,name,type});
  current=parentPsgcCode;
 }
 return {status:'matched',code:String(code),name:records[code][0],type:records[code][1],chain,
  region:chain.find(x=>x.type==='region')??null,
  province:chain.find(x=>x.type==='province')??null,
  cityMunicipality:[...chain].reverse().find(x=>CITY_TYPES.has(x.type))??null,
  barangay:chain.find(x=>x.type==='barangay')??null,
  vintage:registry.provenance.authoritativeRelease,
  verification:registry.provenance.verificationStatus};
}
function norm(s){
 return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^city of\s+/,'').replace(/\s+city$/,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function findPsgc(registry,query,{parentCode=null,type=null}={}){
 const q=norm(query);if(!q)return [];
 const types=type==null?null:new Set(Array.isArray(type)?type:[type]);const out=[];
 for(const [code,entry] of Object.entries(registry.records)){
  if(norm(entry[0])!==q||types&&!types.has(entry[1])||parentCode!==null&&parentCode!==entry[2])continue;
  out.push({code,name:entry[0],type:entry[1],parentPsgcCode:entry[2]});
 }
 return out.sort((a,b)=>a.code.localeCompare(b.code));
}
export function findChildPsgc(registry,parentCode,{type=null}={}){
 const types=type==null?null:new Set(Array.isArray(type)?type:[type]);
 return Object.entries(registry.records)
  .filter(([code,entry])=>entry[2]===parentCode&&(!types||types.has(entry[1])))
  .map(([code,entry])=>({code,name:entry[0],type:entry[1]}))
  .sort((a,b)=>a.code.localeCompare(b.code));
}

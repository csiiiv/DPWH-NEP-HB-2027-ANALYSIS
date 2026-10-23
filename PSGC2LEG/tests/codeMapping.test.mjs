import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCodeMapping} from '../build_code_mapping.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const mapping=read('../outputs/psgc_to_leg_2025.json');
const reg=read('../outputs/psgc_admin_registry_2026-10-12.json');
test('ALL 42,010 PSGC barangays survive, including unresolved codes',()=>{
 assert.equal(mapping.coverage.barangayCodes,42010);
 assert.equal(Object.keys(mapping.records).length,Object.keys(reg.records).length);
 for(const [code,v] of Object.entries(reg.records))assert.ok(mapping.records[code],code);
});
test('published district IDs are all canonical and legal locations point to a valid House seat',()=>{
 const ids=new Set(Object.keys(read('../../DEO2LEG/deo_leg_crosswalk.json').legislativeDistricts));
 for(const [code,[id,status]] of Object.entries(mapping.records)){
  if(id)assert.ok(ids.has(id),code+': '+id);
  if(status==='verified_statute'||status==='verified_statute_inherited')assert.ok(id);
 }
});
test('Commonwealth Quezon City retained as code and not guessed from conflicting research snapshots',()=>{
 assert.equal(reg.records['1381300022'][0],'Commonwealth');
 const result=mapping.records['1381300022'];
 assert.equal(result[0],null);
 assert.equal(result[1],'conflict');
});
test('Bulacan Baliwag city belongs to 2nd district by statute, not stale BetterGov 4th',()=>{
 const cities=Object.entries(reg.records).filter(([code,x])=>['component_city','municipality'].includes(x[1])&&/baliwag|baliuag/i.test(x[0]));
 assert.ok(cities.length>0);
 assert.ok(cities.some(([code])=>mapping.records[code]?.[0]==='leg:bulacan:2nd'));
});
test('Agusan del Norte old district labels are superseded by scoped law, Butuan separate',()=>{
 const r=Object.entries(reg.records).find(([code,x])=>x[0]==='Las Nieves'&&x[1]==='municipality');
 assert.ok(r);assert.equal(mapping.records[r[0]][0],'leg:agusan-del-norte:lone');
});
test('Caloocan third district barangays 178-188 use their cited legislative law',()=>{
 const cal=Object.entries(reg.records).find(([code,x])=>x[0]==='City of Caloocan'&&x[1]==='highly_urbanized_city');
 assert.ok(cal);
 const list=Object.entries(reg.records).filter(([code,x])=>x[2]===cal[0]&&/^Barangay 1(7[89]|8[0-8])$/.test(x[0]));
 assert.equal(list.length,11);
 for(const [code] of list){
   assert.equal(mapping.records[code][0],'leg:caloocan-city:3rd',code);
   assert.equal(mapping.records[code][1],'verified_statute');
 }
});
test('city-specific lone congressional district is not mistaken for Bulacan provincial membership',()=>{
 const city=Object.entries(reg.records).find(([code,r])=>r[1]==='component_city'&&/San Jose del Monte/i.test(r[0]));
 assert.ok(city,'San Jose del Monte city must exist in PSGC');
 assert.equal(mapping.records[city[0]][0],'leg:san-jose-del-monte-city:lone');
 assert.equal(mapping.records[city[0]][1],'provisional_house_roster');
});
test('Rizal Jala-Jala place-name difference is reconciled against statutory Jalajala',()=>{
 const city=Object.entries(reg.records).find(([code,r])=>r[1]==='municipality'&&/Jala.?Jala/i.test(r[0]));
 assert.ok(city);
 assert.equal(mapping.records[city[0]][0],'leg:rizal:2nd');
 assert.equal(mapping.records[city[0]][1],'verified_statute');
});
test('no unmapped record is silently assigned a district',()=>{
 for(const [id,status] of Object.values(mapping.records)){
  if(['conflict','unmatched_seat','requires_barangay','unmapped','not_applicable'].includes(status))assert.equal(id,null);
 }
});

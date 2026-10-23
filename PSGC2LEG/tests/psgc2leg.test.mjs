import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCrosswalk,resolveLocation,materializePsgcCodes,seatKey,jurisdictionKey} from '../lib.mjs';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const cross=read('outputs/psgc_leg_crosswalk.json');
const roster=JSON.parse(readFileSync(new URL('../../DEO2LEG/deo_leg_crosswalk.json',import.meta.url),'utf8'));
test('all linked district IDs are in the canonical DEO2LEG roster',()=>{
 const ids=new Set(Object.keys(roster.legislativeDistricts));
 for(const table of [cross.municipalities,cross.barangays,cross.cities])for(const entry of Object.values(table)){
  if(entry.districtId)assert.ok(ids.has(entry.districtId),entry.districtId);
  for(const id of entry.candidates)assert.ok(ids.has(id),id);
 }
});
test('builder deterministic, committed output matches input snapshots',()=>{
 const actual=buildCrosswalk({primary:read('sources/districts.json'),secondary:read('sources/districts_generated.json'),roster});
 for(const k of ['municipalities','barangays','cities'])assert.deepEqual(actual[k],cross[k]);
});
test('lone district cities resolve without a barangay',()=>{
 const r=resolveLocation(cross,{province:'Metro Manila',municipality:'Pasay City'});
 assert.equal(r.districtId,'leg:pasay-city:lone');
});
test('multi-district cities do not guess without barangay',()=>{
 const r=resolveLocation(cross,{province:'Metro Manila',municipality:'Quezon City'});
 assert.equal(r.districtId,null);assert.equal(r.status,'requires_barangay');
});
test('province names and city names remain distinct',()=>{
 assert.notEqual(jurisdictionKey('Quezon City'),jurisdictionKey('Quezon'));
 assert.equal(jurisdictionKey('Antipolo'),'antipolo city');
});
test('synthetic disagreement blocks geographic assignment',()=>{
 const mini={schemaVersion:'x',legislativeDistricts:{
  'leg:test:1st':{jurisdiction:'Test',districtLabel:'1st'},
  'leg:test:2nd':{jurisdiction:'Test',districtLabel:'2nd'}}};
 const data=buildCrosswalk({primary:{districts:{Test:{municipalities:{Town:'1st District'}}}},secondary:{Test:{Town:'2nd District'}},roster:mini});
 assert.equal(data.municipalities['test|town'].status,'conflict');
 assert.equal(resolveLocation(data,{province:'Test',municipality:'Town'}).districtId,null);
});
test('numeric PSGC lookup can be materialized without guessing code values',()=>{
 const base=buildCrosswalk({primary:{districts:{Test:{municipalities:{Town:'1st District'}}}},secondary:{Test:{Town:'1st District'}},roster:{legislativeDistricts:{'leg:test:1st':{jurisdiction:'Test',districtLabel:'1st'}}}});
 const withCodes=materializePsgcCodes(base,[{province:'Test',municipality:'Town',municipality_psgc:'0123456789'}]);
 assert.equal(resolveLocation(withCodes,{municipality_psgc:'0123456789'}).districtId,'leg:test:1st');
});

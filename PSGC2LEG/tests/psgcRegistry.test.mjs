import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyRegistry,tracePsgc,findPsgc,findChildPsgc} from '../psgc_registry.mjs';
const registry=JSON.parse(readFileSync(new URL('../outputs/psgc_admin_registry_2026-10-12.json',import.meta.url),'utf8'));
test('snapshot enumerates full Q3 2026 administrative inventory and has valid parents',()=>{
 const v=verifyRegistry(registry,{strict2026:true});
 assert.equal(v.counts.barangay,42010);
 assert.equal(v.counts.region,18);
 assert.equal(v.counts.province,82);
 assert.equal(v.total,43768);
});
test('Commonwealth QC code resolves through NCR and not Quezon Province',()=>{
 const result=tracePsgc(registry,'1381300022');
 assert.equal(result.status,'matched');
 assert.equal(result.barangay.name,'Commonwealth');
 assert.equal(result.cityMunicipality.code,'1381300000');
 assert.equal(result.region.code,'1300000000');
 assert.equal(result.province,null);
});
test('same barangay name can occur in multiple municipalities and must be code-disambiguated',()=>{
 const all=findPsgc(registry,'Commonwealth',{type:'barangay'});
 assert.ok(all.length>=3);
 assert.ok(all.some(x=>x.code==='1381300022'));
});
test('Caloocan 193 barangays, not the incomplete research snapshot',()=>{
 const barangays=findChildPsgc(registry,'1380100000',{type:'barangay'});
 assert.equal(barangays.length,193);
 assert.ok(barangays.some(x=>x.name==='Barangay 178'));
});
test('missing PSGC code is not guessed from prefix or similar name',()=>{
 const r=tracePsgc(registry,'1380100999');
 assert.equal(r.status,'unknown_code');
});
test('nonstandard hierarchy keeps city of Isabela structural levels intact',()=>{
 const b=findPsgc(registry,'Isabela Eastside',{type:'barangay'});
 assert.equal(b.length,1);
 const r=tracePsgc(registry,b[0].code);
 assert.equal(r.region.code,'0900000000');
 assert.equal(r.status,'matched');
 assert.equal(r.province,null);
});
test('PSA Q3 2026 Lambagan spelling reflected in mirrored snapshot',()=>{
 const l=findPsgc(registry,'Lambagan',{type:'barangay'});
 assert.ok(l.length>0);
 const old=findPsgc(registry,'Lambangan',{type:'barangay'});
 assert.ok(l.some(x=>tracePsgc(registry,x.code).chain.some(p=>p.name==='Cabanglasan')));
 assert.ok(!old.some(x=>tracePsgc(registry,x.code).chain.some(p=>p.name==='Cabanglasan')));
});

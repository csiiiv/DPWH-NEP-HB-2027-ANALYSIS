import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupCode,lookupGeocoder,audit} from '../lookup_district.mjs';
test('Commonwealth stays unresolved by exact PSGC ID, no councilor district guessing',()=>{
 const r=lookupCode('1381300022');
 assert.equal(r.status,'conflict');
 assert.equal(r.legislativeDistrictId,null);
 assert.equal(r.psgc.barangay.name,'Commonwealth');
});
test('PSGC names do not replace exact numeric code',()=>{
 const r=lookupGeocoder({municipality:'Quezon City',barangay:'Commonwealth'});
 assert.equal(r.status,'missing_psgc_code');
});
test('geocoder may supply PSGC barangay code and gets House seat where supported',()=>{
 const r=lookupGeocoder({municipality_psgc:'1381300000',barangay_psgc:'1381300022'});
 assert.equal(r.psgcCode,'1381300022');
 assert.equal(r.status,'conflict');
});
test('invalid and unknown codes stay unassigned',()=>{
 for(const code of ['1380100999','123']){
  const r=lookupCode(code);
  assert.equal(r.legislativeDistrictId??null,null);
 }
});
test('audit reports exactly 254 canonical seats and retained missing seats',()=>{
 const x=audit();
 assert.equal(x.coverage.rosterHouseDistricts,254);
 assert.equal(x.coverage.administrativeCodes,43768);
 assert.equal(x.missingHouseDistricts.length,254-x.coverage.mappedHouseDistricts);
});

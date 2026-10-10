import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {regionCandidates} from './regionCandidates.js';
import {unifiedComparison} from './unifiedComparison.js';
import {selectRows} from './model.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
test('optional region join preserves every amount and source, flags unique candidates',()=>{
 const strict=unifiedComparison(read('stage_trace_2027'),read('house_reading_changes_2027')).projects;
 const snapshot=JSON.stringify(strict),relaxed=regionCandidates(strict);
 assert.equal(JSON.stringify(strict),snapshot);
 const candidates=relaxed.filter(r=>r.region_difference);
 // Retained Central Office/region echo wrappers give House FAP rows real
 // attribution, so every FAP loan now matches strictly: no region-difference
 // candidates remain, and NEP FAP coverage is complete.
 assert.equal(candidates.length,0);
 // The remaining unmatched House FAP rows are genuinely absent NEP records.
 assert.equal(relaxed.filter(r=>r.zone==='fap' && (r.second||r.third) && !r.nep).length,4);
 assert.equal(relaxed.filter(r=>r.zone==='fap' && r.nep && !(r.second||r.third)).length,0);
 for(const side of ['api','nep','second','third']){
  const records=rows=>rows.filter(r=>r[side]).map(r=>[r[side].id,r[side].amount_php]).sort();
  assert.deepEqual(records(relaxed),records(strict));
 }
 // The join itself still works for genuinely differing regions (unit case below).
 assert.deepEqual(regionCandidates(relaxed),relaxed);
});
test('region join refuses duplicates, already anchored records, same regions and groups',()=>{
 const record=(id,region='NCR',pap_id='pap1')=>({id,title:'Unique title',program:'P',zone:'local',pap_id,region,amount_php:10});
 const h={id:'h',second:record('h','Nationwide'),third:record('h3','Nationwide'),reading_status:'same_amount'};
 const n={id:'n',nep:record('n')};
 assert.equal(regionCandidates([h,n]).length,1);
 for(const rows of [
  [h,n,{id:'duplicate',nep:record('n2')}],
  [h,n,{id:'matched',second:record('h2'),nep:record('n2')}],
  [{...h,second:record('h','NCR')},n],
  [{...h,second:{...h.second,records:[h.second,h.second]}},n],
  [{...h,reading_status:'repeated_key'},n]
 ])assert.deepEqual(regionCandidates(rows),rows);
 // Differing program or PAP labels alone no longer block a unique-title join.
 assert.equal(regionCandidates([h,{id:'n',nep:record('n','NCR','pap2')}]).length,1);
 assert.equal(regionCandidates([{...h,second:{...h.second,program:'Different program'}},n]).length,1);
});

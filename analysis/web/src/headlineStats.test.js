import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headlineStats,officeKind} from './headlineStats.js';
import {unifiedComparison} from './unifiedComparison.js';
test('headline office and program buckets conserve each source ledger and count grouped members once',()=>{
 const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}`,import.meta.url)));
 const rows=unifiedComparison(read('stage_trace_2027.json'),read('house_reading_changes_2027.json')).projects;
 const stats=headlineStats(rows);
 for(const side of ['third','second','nep','api']){
  const source=stats.sources[side];
  assert.equal(source.amount_php,rows.reduce((sum,r)=>sum+(r[side]?.amount_php??0),0));
  assert.equal(source.records,rows.reduce((sum,r)=>sum+(r[side]?(r[side].records?.length??1):0),0));
  for(const buckets of [source.programs,source.offices]){
   assert.equal(Object.values(buckets).reduce((sum,b)=>sum+b.records,0),source.records);
   assert.equal(Object.values(buckets).reduce((sum,b)=>sum+b.amount_php,0),source.amount_php);
  }
  assert.equal(source.programs['Foreign-assisted projects'].amount_php,rows.filter(r=>r.zone==='fap').reduce((sum,r)=>sum+(r[side]?.amount_php??0),0));
 }
 for(const side of ['second','third']){
  const indexed=new Map(rows.map(r=>[r.id,r]));
  for(const r of stats.rankings[side].no_suggestion.top){const original=indexed.get(r.id);assert.ok(!original.nep && !original.api && !original.suggestions?.length);assert.ok(!['fuzzy_candidate','ambiguous','chainage_candidate'].includes(original.trace));}
  for(const r of stats.rankings[side].unresolved.top){const original=indexed.get(r.id);assert.ok(original.suggestions?.length || ['fuzzy_candidate','ambiguous','chainage_candidate'].includes(original.trace));}
 }
 assert.equal(stats.rankings.third.third_only.comparison_rows,5);
 assert.equal(stats.rankings.third.third_only.amount_php,134000000);
});
test('office labels do not infer DEOs from region or missing assignments',()=>{
 assert.equal(officeKind(' Central  Office '),'Central Office');
 assert.equal(officeKind('Quezon 4th District Engineering Office'),'District engineering offices (DEOs)');
 assert.equal(officeKind('Regional Office IV-A'),'Regional offices');
 assert.equal(officeKind('BARMM'),'Other recorded offices');
 assert.equal(officeKind(''),'No recorded office');
});

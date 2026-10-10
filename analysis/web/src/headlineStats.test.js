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
  for(const r of stats.rankings[side].no_suggestion.top){const original=indexed.get(r.id);assert.ok(!original.nep && !original.api && !original.suggestions?.length);assert.ok(!['fuzzy_candidate','ambiguous'].includes(original.trace));}
  for(const r of stats.rankings[side].unresolved.top){const original=indexed.get(r.id);assert.ok(original.suggestions?.length || ['fuzzy_candidate','ambiguous'].includes(original.trace));}
 }
 assert.equal(stats.rankings.third.third_only.comparison_rows,5);
 assert.equal(stats.rankings.third.third_only.amount_php,134000000);
 // Deletion groups partition the NEP-only rows exactly, with suggested
 // replacements carrying their referring House row counts.
 const nepOnly=rows.filter(r=>r.nep && !r.second && !r.third);
 const groups=stats.deletions;
 assert.equal(groups.no_suggestion.comparison_rows+groups.suggested.comparison_rows,nepOnly.length);
 assert.equal(groups.no_suggestion.amount_php+groups.suggested.amount_php,
  nepOnly.reduce((sum,r)=>sum+r.nep.amount_php,0));
 assert.equal(groups.second_only.comparison_rows,
  rows.filter(r=>r.reading_status==='second_only').length);
 for(const r of groups.suggested.top)assert.ok(r.referring_house_rows>=1);
 for(const r of groups.no_suggestion.top)assert.equal(r.referring_house_rows,0);
 for(const dim of ['region','program','pap']){
  const g=groups.no_suggestion.by_dim[dim];
  assert.equal(g.reduce((sum,x)=>sum+x.rows,0),groups.no_suggestion.comparison_rows);
  assert.equal(g.reduce((sum,x)=>sum+x.amount_php,0),groups.no_suggestion.amount_php);
 }
 // Office aggregates cap at 100 groups (same as Insertions); the dropped tail
 // stays reachable through the full row list, so the sum is only bounded.
 const offices=groups.no_suggestion.by_dim.office;
 assert.ok(offices.length<=100 && offices.reduce((sum,x)=>sum+x.rows,0)<=groups.no_suggestion.comparison_rows);
 // NEP vs House by dimension: each side’s column sums to its source ledger.
 const compare=stats.sourceCompare.third;
 assert.equal(compare.nep_php,stats.sources.nep.amount_php);
 assert.equal(compare.house_php,stats.sources.third.amount_php);
 assert.equal(compare.delta_php,compare.house_php-compare.nep_php);
 for(const dim of ['region','program','pap','office']){
  const groups=compare.by_dim[dim];
  assert.equal(groups.reduce((sum,g)=>sum+g.nep_php,0),compare.nep_php);
  assert.equal(groups.reduce((sum,g)=>sum+g.house_php,0),compare.house_php);
  assert.equal(groups.reduce((sum,g)=>sum+g.delta_php,0),compare.delta_php);
  assert.equal(groups.reduce((sum,g)=>sum+g.nep_records,0),stats.sources.nep.records);
  assert.equal(groups.reduce((sum,g)=>sum+g.house_records,0),stats.sources.third.records);
 }
 assert.equal(compare.by_dim.overall[0].delta_php,compare.delta_php);
 assert.equal(compare.by_dim.overall[0].nep_records,stats.sources.nep.records);
 assert.equal(compare.by_dim.overall[0].house_records,stats.sources.third.records);
 assert.ok(compare.by_dim.region.some(g=>g.label==='NCR'));
 assert.ok(compare.by_dim.region.length>=10);
});
test('office labels do not infer DEOs from region or missing assignments',()=>{
 assert.equal(officeKind(' Central  Office '),'Central Office');
 assert.equal(officeKind('Quezon 4th District Engineering Office'),'District engineering offices (DEOs)');
 assert.equal(officeKind('Regional Office IV-A'),'Regional offices');
 assert.equal(officeKind('BARMM'),'Other recorded offices');
 assert.equal(officeKind(''),'No recorded office');
});

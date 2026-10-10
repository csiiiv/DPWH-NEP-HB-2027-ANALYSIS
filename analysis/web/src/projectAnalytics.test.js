import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectAnalytics,compareDistribution} from './projectAnalytics.js';
import {readingInfo,matchInfo,flagInfo} from './analyticsStatusInfo.js';
import {unifiedComparison} from './unifiedComparison.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
test('analytics of all rows preserves source ledgers, additions and House delta',()=>{
 const stages=read('stage_trace_2027'),readings=read('house_reading_changes_2027');
 const rows=unifiedComparison(stages,readings).projects,stats=projectAnalytics(rows);
 assert.equal(stats.count,18149);assert.equal(stats.changes.third_only,5);assert.equal(stats.readingDelta,134000000);
 for(const side of ['second','third'])assert.equal(stats.totals[side].amount,readings.summary[side].operations_including_projects);
 for(const side of ['api','nep'])assert.equal(stats.totals[side].amount,stages.projects.reduce((s,r)=>s+(r[side]?.amount_php || 0),0));
 const regions=compareDistribution(rows,'region');
 assert.equal(regions.totals.hb,stats.totals.third.amount);
 assert.equal(regions.totals.nep,stats.totals.nep.amount);
 assert.equal(regions.entries.reduce((s,r)=>s+r.hb,0),stats.totals.third.amount);
 assert.equal(regions.entries.reduce((s,r)=>s+r.nep,0),stats.totals.nep.amount);
 assert.equal(regions.coverage.hb,stats.totals.third.rows);
 assert.equal(regions.coverage.nep,stats.totals.nep.rows);
});
test('paired distributions keep differing labels, absent sources and own-scale shares distinct',()=>{
 const rows=[
  {id:'a',title:'BCIB',reading_status:'same_amount',trace:'region_difference_candidate',reading_delta_php:0,
   second:{title:'BCIB',amount_php:8,region:'Nationwide',office:''},third:{title:'BCIB',amount_php:8,region:'Nationwide',office:''},nep:{title:'BCIB',amount_php:22,region:'NCR',office:'Central Office',evidence:'native_row_ambiguity'}},
  {id:'b',title:'Grouped road',reading_status:'repeated_key',trace:'house_only_candidate',reading_delta_php:0,
   third:{amount_php:24,region:'NCR',office:'DEO',records:[{},{}]}},
  {id:'c',title:'New entry',reading_status:'third_only',trace:'house_only_candidate',reading_delta_php:3,third:{amount_php:3,region:'NCR',office:''}},
 ];
 const stats=projectAnalytics(rows);
 assert.equal(stats.totals.api.rows,0);assert.equal(stats.totals.third.records,4);assert.equal(stats.totals.third.amount,35);
 assert.equal(stats.flags.region_difference,1);assert.equal(stats.flags.uncertain_match,1);assert.equal(stats.flags.nep_evidence_review,1);assert.equal(stats.flags.no_office,1);
 assert.equal(stats.readingDelta,3);assert.equal(stats.flaggedRows,3);
 assert.deepEqual(compareDistribution(rows,'region'),{entries:[
  {label:'NCR',rows:3,hb:27,nep:22},
  {label:'Nationwide',rows:1,hb:8,nep:0},
 ],totals:{hb:35,nep:22},coverage:{hb:3,nep:1,neither:0}});
 assert.deepEqual(compareDistribution(rows,'office'),{entries:[
  {label:'DEO',rows:1,hb:24,nep:0},
  {label:'Central Office',rows:1,hb:0,nep:22},
  {label:'No recorded office',rows:2,hb:11,nep:0},
 ],totals:{hb:35,nep:22},coverage:{hb:3,nep:1,neither:0}});
 assert.deepEqual(compareDistribution([],'third').entries,[]);
 assert.equal(projectAnalytics(rows.slice(2)).count,1);
});

test('every retained reading/match status and flag has a plain-language explanation',()=>{
 const rows=unifiedComparison(read('stage_trace_2027'),read('house_reading_changes_2027')).projects;
 const stats=projectAnalytics(rows);
 for(const [entries,definitions] of [[stats.changes,readingInfo],[stats.matches,matchInfo],[stats.flags,flagInfo]])
  for(const key of Object.keys(entries)){assert(definitions[key]?.[0],key);assert(definitions[key]?.[1]?.length>40,key);}
 assert(matchInfo.region_difference_candidate[1].includes('Original assignments are preserved'));
});

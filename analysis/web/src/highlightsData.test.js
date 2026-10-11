import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headlineStats} from './headlineStats.js';
import {highlightsData} from './highlightsData.js';
import {unifiedComparison} from './unifiedComparison.js';
import {matchesFlag} from './matchFilters.js';

const record=(id,amount_php,extra={})=>({id,title:id,amount_php,zone:'local',region:'Region I',office:'Central Office',program:'Bridge Program',pap:'Bridges',...extra});
function fixture(rows,extras={}){
 const headlines=headlineStats(rows);
 return highlightsData({rows,headlines,paps:[],stages:{summary:{stages:{official_nep:{new_appropriations_php:headlines.sources.nep.amount_php}},official_to_house:{reviewed_pairs:0},transparency_to_official:{}}},readings:{summary:{third:{new_appropriations:headlines.sources.third.amount_php},allocation_delta_php:0}},...extras});
}
test('change bridge counts grouped members once, excludes suggestions, and includes foreign-assisted changes',()=>{
 const grouped={...record('group',30),records:[record('a',10),record('b',20)]};
 const rows=[
  {id:'group',third:grouped,trace:'fuzzy_candidate',suggestions:[{nep:record('suggestion',900)}]},
  {id:'deleted',nep:record('d',40)},
  {id:'up',nep:record('u',100),third:record('u',110)},
  {id:'down',nep:record('fap',200,{zone:'fap',region:'NCR'}),third:record('fap',150,{zone:'fap',region:'NCR'}),trace:'outside_api_then_candidate_decrease'},
  {id:'same',nep:record('s',5),third:record('s',5)},
 ];
 const data=fixture(rows);
 assert.deepEqual(data.changes.insertions,{comparison_rows:1,records:2,amount_php:30});
 assert.equal(data.unresolved_insertions,1);
 assert.equal(data.changes.increased.amount_php,10);
 assert.equal(data.changes.decreased.amount_php,50);
 assert.equal(data.changes.deletions.amount_php,40);
 assert.equal(data.changes.unchanged.records,1);
 assert.equal(data.net_change_php,-50);
 assert.equal(data.sources.third.records,5);
 assert.equal(data.sources.third.amount_php,295);
 assert.equal(data.sources.nep.amount_php,345);
 assert.equal(data.regions.find(r=>r.label==='NCR').delta_php,0,'regional gains exclude FAP assignment echoes');
});
test('shorter unchanged-amount lead excludes flagged lengths and uses the third reading',()=>{
 const rows=['clean','repaired','longer','amount'].map((id,i)=>({id,title:id,house_match:'chainage_candidate',nep:record('n'+i,100),second:record('second'+i,100),third:record('third'+i,i===3?200:100,{native_node_id:'c'+i})}));
 const units=rows.flatMap((row,i)=>[
  {id:`nep:${row.nep.id}`,length_m:100},
  {id:`hb3:c${i}`,length_m:i===2?200:50,length_review:i===1?'repaired':null,amount_php:row.third.amount_php},
 ]);
 const data=fixture(rows,{chainage:{units}});
 assert.equal(data.chainage.shorter_same_amount,1);
 assert.equal(data.chainage.example.id,'clean');
});
test('retained DPWH data reproduces both House readings and the full operations change',()=>{
 const load=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
 const stages=load('stage_trace_2027'),readings=load('house_reading_changes_2027');
 const unified=unifiedComparison(stages,readings),headlines=headlineStats(unified.projects);
 const data=highlightsData({rows:unified.projects,headlines,paps:unified.paps,stages,readings,roadGroups:load('road_group_candidates_2027'),chainage:load('chainage_units_2027')});
 assert.equal(data.sources.nep.amount_php,stages.summary.stages.official_nep.operations_php);
 for(const side of ['second','third']){
  assert.equal(data.sources[side].amount_php,readings.summary[side].operations_including_projects);
  assert.equal(data.sources[side].records,readings.summary[side].allocations);
 }
 assert.equal(data.net_change_php,readings.summary.third.operations_including_projects-stages.summary.stages.official_nep.operations_php);
 assert.ok(data.changes.decreased.amount_php>73e9,'FAP changes remain included');
 assert.equal(data.grouping.leftover_amount_php,stages.road_group_summary.leftover_amount_php);
 assert.ok(data.chainage.shorter_same_amount>0);
 assert.ok(data.chainage.example.title.includes('Panitan'));
 assert.equal(data.rainwater.third.amount_php,1027200000);
 assert.equal(data.rainwater.third.records,217);
 assert.deepEqual(data.rainwater.nep,data.rainwater.third);
 assert.deepEqual(data.rainwater.second,data.rainwater.third);
 assert.deepEqual(data.rainwater.third.bands,[
  {amount_php:4200000,records:199,total_php:835800000},
  {amount_php:9000000,records:17,total_php:153000000},
  {amount_php:38400000,records:1,total_php:38400000},
 ]);
 const deletionRows=unified.projects.filter(row=>matchesFlag(row,'nep_only_all'));
 assert.equal(deletionRows.reduce((sum,row)=>sum+row.nep.amount_php,0),data.changes.deletions.amount_php);
 assert.equal(deletionRows.length,data.changes.deletions.comparison_rows);
});

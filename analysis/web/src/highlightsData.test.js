import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headlineStats} from './headlineStats.js';
import {highlightsData} from './highlightsData.js';
import {unifiedComparison} from './unifiedComparison.js';
import {matchesFlag, matchesMatchStatus} from './matchFilters.js';
import {regionCandidates} from './regionCandidates.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';

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
 // Only validated candidates enter the four change columns; the grouped
 // fuzzy insertion is held out, the clean deletion stays.
 assert.deepEqual(data.changes.insertions,{comparison_rows:0,records:0,amount_php:0});
 assert.deepEqual(data.held.insertions,{comparison_rows:1,records:2,amount_php:30});
 assert.deepEqual(data.changes.deletions,{comparison_rows:1,records:1,amount_php:40});
 assert.deepEqual(data.changes_full.insertions,{comparison_rows:1,records:2,amount_php:30});
 assert.equal(data.unresolved_insertions,1);
 assert.equal(data.changes.increased.amount_php,10);
 assert.equal(data.changes.decreased.amount_php,50);
 assert.equal(data.changes.deletions.amount_php,40);
 assert.equal(data.changes.unchanged.records,1);
 assert.equal(data.net_change_php,-50);
 assert.equal(data.validated_net_php,-80);
 assert.equal(data.sources.third.records,5);
 assert.equal(data.sources.third.amount_php,295);
 assert.equal(data.sources.nep.amount_php,345);
 assert.equal(data.regions.find(r=>r.label==='NCR').delta_php,0,'regional gains exclude FAP assignment echoes');
 // Ambiguity split mirrors the Analysis ranking classification: the fixture's
 // only house-only row is the grouped fuzzy row, so it lands in unresolved.
 // Deletion splits follow suggestedCounterparts; the fixture's deletion has
 // no referring House row.
 assert.deepEqual(data.insertion_split,{no_suggestion:{comparison_rows:0,amount_php:0},unresolved:{comparison_rows:1,amount_php:30}});
 assert.deepEqual(data.deletion_split,{no_suggestion:{comparison_rows:1,amount_php:40},suggested:{comparison_rows:0,amount_php:0}});
 assert.deepEqual(data.traceability,{rows:1,amount_php:30});
 assert.deepEqual(data.controls,{nep_php:null,second_php:null,third_php:null,delta_php:null},
  'control layer stays null without new-appropriations controls in the fixture');
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
 // Only validated candidates populate the published columns; the full
 // buckets (validated + held) still reconcile with the printed ledgers.
 assert.ok(data.changes.insertions.comparison_rows<data.changes_full.insertions.comparison_rows,
  `published insertions must exclude the held rows: ${data.changes.insertions.comparison_rows} vs ${data.changes_full.insertions.comparison_rows}`);
 assert.ok(data.changes.deletions.comparison_rows<data.changes_full.deletions.comparison_rows,
  `published deletions must exclude the held rows: ${data.changes.deletions.comparison_rows} vs ${data.changes_full.deletions.comparison_rows}`);
 assert.ok(data.validated_net_php>0&&data.validated_net_php<data.net_change_php,
  `validated net ${data.validated_net_php} must be a positive fraction of the printed net ${data.net_change_php}`);
 assert.equal(data.unresolved_insertions,data.insertion_split.unresolved.comparison_rows);
 // Ambiguity split on retained data mirrors the Analysis page buckets:
 // ~5,804 clean insertion candidates + ~389 unresolved; ~1,068 clean
 // deletions + ~273 possible replacements. Traceability sums the two
 // ambiguous groups.
 assert.equal(data.insertion_split.no_suggestion.comparison_rows+data.insertion_split.unresolved.comparison_rows,
  data.unresolved_insertions+data.changes_full.insertions.comparison_rows-data.unresolved_insertions);
 assert.ok(data.insertion_split.no_suggestion.comparison_rows>5700&&data.insertion_split.no_suggestion.comparison_rows<5900,
  `unexpected no-suggestion insertions: ${data.insertion_split.no_suggestion.comparison_rows}`);
 assert.ok(data.insertion_split.unresolved.comparison_rows>350&&data.insertion_split.unresolved.comparison_rows<430,
  `unexpected unresolved insertions: ${data.insertion_split.unresolved.comparison_rows}`);
 assert.ok(data.deletion_split.no_suggestion.comparison_rows>1000&&data.deletion_split.no_suggestion.comparison_rows<1120,
  `unexpected no-suggestion deletions: ${data.deletion_split.no_suggestion.comparison_rows}`);
 assert.ok(data.deletion_split.suggested.comparison_rows>230&&data.deletion_split.suggested.comparison_rows<320,
  `unexpected possible-replacement deletions: ${data.deletion_split.suggested.comparison_rows}`);
 assert.equal(data.deletion_split.no_suggestion.comparison_rows+data.deletion_split.suggested.comparison_rows,
  data.changes_full.deletions.comparison_rows);
 assert.equal(data.changes.deletions.comparison_rows,data.deletion_split.no_suggestion.comparison_rows,
  'published deletions are exactly the no-suggestion rows');
 assert.equal(data.changes.insertions.comparison_rows,data.insertion_split.no_suggestion.comparison_rows,
  'published insertions are exactly the no-suggestion rows');
 assert.equal(data.traceability.rows,data.insertion_split.unresolved.comparison_rows+data.deletion_split.suggested.comparison_rows);
 assert.equal(data.traceability.amount_php,data.insertion_split.unresolved.amount_php+data.deletion_split.suggested.amount_php);
 // Control layer above operations: NEP ≈ ₱69.69B, HGAB3 ≈ ₱67.03B.
 assert.ok(Math.abs(data.controls.nep_php-69.688e9)<1e6,'NEP controls total');
 assert.ok(Math.abs(data.controls.third_php-67.026e9)<1e6,'HGAB3 controls total');
 assert.ok(Math.abs(data.controls.delta_php-(-2.662e9))<1e6,'control-layer change');
 assert.ok(Math.abs(data.controls.second_php-67.160e9)<1e6,'HGAB2 controls total');
 // Splits stay inside their parent buckets: no double counting.
 assert.ok(data.insertion_split.no_suggestion.amount_php<data.changes_full.insertions.amount_php);
 assert.ok(data.deletion_split.no_suggestion.amount_php<data.changes_full.deletions.amount_php);
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
 assert.equal(deletionRows.reduce((sum,row)=>sum+row.nep.amount_php,0),data.changes_full.deletions.amount_php);
 assert.equal(deletionRows.length,data.changes_full.deletions.comparison_rows);
 const reviewRows=regionCandidates(unified.projects),counterparts=suggestedCounterparts(reviewRows);
 for(const [key,flag,match] of [['insertions','house_only','no_match'],['deletions','nep_only',''],
  ['increased','amount_increase',''],['decreased','amount_decrease','']]){
  const subset=reviewRows.filter(row=>matchesFlag(row,flag,counterparts)&&matchesMatchStatus(row,match));
  assert.equal(subset.length,data.changes[key].comparison_rows,key);
  const allocation=row=>key==='insertions'?row.third.amount_php:key==='deletions'?row.nep.amount_php
   :Math.abs(row.third.amount_php-row.nep.amount_php);
  assert.equal(subset.reduce((sum,row)=>sum+allocation(row),0),data.changes[key].amount_php,key);
 }
});

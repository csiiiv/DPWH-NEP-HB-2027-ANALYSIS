import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDaDraftChangeLog, annotateDaDeltaRows, summarizeDaDeltaChanges, linkDaNearbyReplacements, DA_CHANGE_TYPES, DA_CHANGE_CAVEAT} from './fmrDaCoherence.js';
import {buildHouseDaRedFlagDelta} from './fmrRedFlags.js';

const draft=JSON.parse(fs.readFileSync(new URL('../../../other-analysis/data/da_fmr_draft.json', import.meta.url),'utf8'));
const workbench=JSON.parse(fs.readFileSync(new URL('../../../other-analysis/data/fmr_workbench.json', import.meta.url),'utf8'));
const original=(id,row,amount=15000000,extra={})=>({id,excel_row:row,kind:'original',region_key:'I',control_no:id,
  from_title:id,from_amount_php:amount,effective_title:null,effective_amount_php:0,disposition:'dropped',remarks:'',...extra});
const newer=(id,row,amount=15000000,extra={})=>({id,excel_row:row,kind:'new',region_key:'I',control_no:id,
  effective_title:id,effective_amount_php:amount,disposition:'new',remarks:'',...extra});

test('DA change log conserves source rows and never changes source dataset',()=>{
  const before=JSON.stringify(draft), result=buildDaDraftChangeLog(draft,workbench);
  assert.equal(result.originalCount,704);
  assert.equal(result.sourceRows,draft.projects.length);
  assert.equal(result.totalEvents + result.linkedReplacementCount,result.sourceRows);
  assert.equal(result.rows.reduce((sum,r)=>sum+r.sourceIds.length,0),result.sourceRows);
  assert.equal(new Set(result.rows.flatMap(r=>r.sourceIds)).size,result.sourceRows);
  assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),result.totalEvents);
  assert.ok(result.rows.every(r=>DA_CHANGE_TYPES[r.changeType]));
  assert.equal(JSON.stringify(draft),before);
  assert.match(DA_CHANGE_CAVEAT,/not independently verified/);
});
test('existing nearby replacement method is one-to-one, source-local and does not require equal amounts',()=>{
  const rows=[original('drop1',1),newer('new1',2),original('drop2',3,30000000),
    newer('new2',4,10000000),original('drop3',5),newer('other-region',6,12000000,{region_key:'II'})];
  const links=linkDaNearbyReplacements(rows);
  assert.deepEqual([...links],[['drop1','new1'],['drop2','new2']]);
  const log=buildDaDraftChangeLog({projects:rows});
  assert.equal(log.rows.find(e=>e.id==='drop1').changeType,'paired_move');
  assert.equal(log.rows.find(e=>e.id==='drop2').changeType,'clean_replacement');
  assert.equal(log.rows.find(e=>e.id==='drop3').changeType,'unexplained_drop');
  assert.equal(log.counts.unexplained_addition,1);
});
test('remarks and NEP exact candidate produce bounded, non-accusatory labels',()=>{
  const rows=[newer('claimed',1,900,{remarks:'Reprioritized due to agricultural needs'}),
    newer('fix',2,200,{remarks:'Title and coordinate correction',effective_title:'Canal Road'}),
    newer('blank',3,300),
    original('retained',4,400,{disposition:'retain',effective_amount_php:400,effective_title:'Retained road'})];
  const nep={stages:{nep:{projects:[{id:'n',title:'Canal Road',region_key:'I',amount_php:200}]}}};
  const log=buildDaDraftChangeLog({projects:rows},nep);
  assert.deepEqual(log.rows.map(row=>row.changeType),
    ['retained','claimed_move','correction','unexplained_addition']);
  assert.equal(log.rows.find(row=>row.id==='fix').nepCandidate.id,'n');
  assert.match(log.rows.find(row=>row.id==='claimed').daRemarkSnippet,/Reprioritized/);
});
test('DA context is additive to the existing flagged delta; status and flags are unchanged',()=>{
  const originalDelta=buildHouseDaRedFlagDelta(workbench), register=buildDaDraftChangeLog(draft,workbench);
  const rows=annotateDaDeltaRows(originalDelta.rows,workbench,register);
  assert.equal(rows.length,originalDelta.rows.length);
  assert.ok(rows.every(row=>DA_CHANGE_TYPES[row.changeType]));
  assert.deepEqual(rows.map(r=>r.status),originalDelta.rows.map(r=>r.status));
  assert.deepEqual(rows.map(r=>r.house_flags),originalDelta.rows.map(r=>r.house_flags));
  assert.deepEqual(rows.map(r=>r.da_flags),originalDelta.rows.map(r=>r.da_flags));
  assert.deepEqual(rows.map(r=>r.house_php),originalDelta.rows.map(r=>r.house_php));
  assert.deepEqual(rows.map(r=>r.da_php),originalDelta.rows.map(r=>r.da_php));
  const counts=summarizeDaDeltaChanges(rows);
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
  assert.equal(originalDelta.counts.unmatched_da,originalDelta.rows.filter(r=>r.status==='unmatched_da').length);
});
test('standalone House-only rows are not called DA deletions',()=>{
  const [row]=annotateDaDeltaRows([{id:'unmatched_house:test',house_id:'test',da_id:null,region_key:'I',
    house_flags:['long_span'],da_flags:[],house_php:100,da_php:null}],{comparison:[],stages:{da:{projects:[]}}});
  assert.equal(row.changeType,'house_only');
  assert.match(row.narrative,/No DA match/);
});

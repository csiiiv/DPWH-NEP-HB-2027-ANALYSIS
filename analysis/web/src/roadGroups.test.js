import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roadGroupStats,groupPerKmProfile} from './roadGroups.js';
const payload=JSON.parse(readFileSync(new URL('../../data/road_group_candidates_2027.json',import.meta.url)));
const groups=payload.groups;

test('road group sidecar reconciles summary with group rows',()=>{
 const summary=payload.summary;
 const leftover=groups.reduce((sum,g)=>sum+g.leftover_house_rows,0);
 assert.equal(summary.exhausted_groups,groups.length);
 assert.equal(summary.leftover_house_rows,leftover);
 assert.equal(summary.leftover_amount_php,groups.reduce((sum,g)=>sum+g.leftover_amount_php,0));
 assert.equal(summary.exhausted_road_groups,groups.filter(g=>g.kind==='road').length);
 assert.equal(summary.exhausted_place_shell_groups,groups.filter(g=>g.kind==='place_shell').length);
 // Collapsed model: every group member is one final-sheet budget line.
 // Attached pairs collapse to their HGAB anchor (NEP kept as provenance);
 // leftovers stand alone; NEP-only rows appear only in different shells.
 for(const g of groups){
  assert.ok(g.nep_rows>0);
  assert.ok(g.leftover_house_rows>0);
  assert.ok(g.leftover_ids.length===g.leftover_house_rows);
  assert.equal(g.members.length,g.house_rows);
  assert.equal(g.paired_rows+g.leftover_house_rows,g.house_rows);
  const paired=g.members.filter(m=>m.attached);
  assert.equal(paired.length,g.paired_rows);
  for(const m of paired){
   assert.ok(m.nep_id!=null && m.nep_amount_php!=null && m.delta_php!=null);
   assert.equal(m.amount_php-m.nep_amount_php,m.delta_php);
  }
  assert.ok(g.shell && g.kind);
  assert.ok(['split_like','unsupplied_cluster','micro_supplied'].includes(g.pattern));
 }
 assert.ok(roadGroupStats(groups).exhausted===groups.length);
 // Pattern counts reconcile.
 assert.equal(summary.split_like_groups+summary.unsupplied_cluster_groups+summary.micro_supplied_groups,groups.length);
 // Region rollup conserves the group totals across both directions.
 const regions=payload.region_summary,nepGroups=payload.nep_leftover_groups;
 assert.equal(regions.reduce((s,r)=>s+r.exhausted_groups,0),groups.length);
 assert.equal(regions.reduce((s,r)=>s+r.leftover_house_rows,0),leftover);
 assert.equal(regions.reduce((s,r)=>s+r.nep_leftover_groups,0),nepGroups.length);
 assert.equal(regions.reduce((s,r)=>s+r.paired_rows,0),groups.reduce((s,g)=>s+g.paired_rows,0)+nepGroups.reduce((s,g)=>s+g.paired_rows,0));
 // Final-sheet conservation: paired rows carry their NEP provenance so the
 // group's NEP total equals the sum of collapsed NEP amounts.
 assert.equal(groups.reduce((s,g)=>s+g.nep_amount_php,0),
   groups.reduce((s,g)=>s+g.members.reduce((t,m)=>t+(m.attached?m.nep_amount_php:0),0),0));
 // The Laoag INSPIRE case classifies as an unsupplied cluster: the paired
 // ₱835M NEP building is different work from the barangay-scale leftovers.
 const laoag=groups.find(g=>/laoag city/.test(g.shell));
 assert.ok(laoag);
 assert.equal(laoag.pattern,'unsupplied_cluster');
});

test('nep leftover direction reconciles with mirror invariants',()=>{
 const nep=payload.nep_leftover_groups,summary=payload.summary;
 assert.equal(summary.nep_leftover_groups,nep.length);
 assert.equal(summary.leftover_nep_rows,nep.reduce((s,g)=>s+g.leftover_nep_rows,0));
 assert.equal(summary.leftover_nep_amount_php,nep.reduce((s,g)=>s+g.leftover_nep_amount_php,0));
 for(const g of nep){
  assert.equal(g.state,'nep_leftover');
  assert.ok(g.paired_rows>0);
  assert.ok(g.leftover_house_rows===0);
  assert.ok(g.leftover_nep_ids.length===g.leftover_nep_rows);
  assert.equal(g.paired_rows+g.leftover_nep_rows,g.nep_rows);
 }
 // Disjoint directions: no full group key (zone+pap+region+kind+shell) is
 // both hgab-leftover and nep-leftover. Same shell under different PAPs is
 // a distinct group and may legitimately appear in both lists.
 const hgabKeys=new Set(groups.map(g=>[g.zone,g.pap,g.region,g.kind,g.shell].join('\u0000')));
 for(const g of nep)assert.equal(hgabKeys.has([g.zone,g.pap,g.region,g.kind,g.shell].join('\u0000')),false);
});

test('road group flags match sidecar leftovers',()=>{
 // The stage-trace flag rides on House rows (exhausted direction) and NEP
 // rows (nep-leftover direction); every sidecar leftover id must appear
 // exactly once. Reads the committed stage trace.
 const trace=JSON.parse(readFileSync(new URL('../../data/stage_trace_2027.json',import.meta.url)));
 const flagged=trace.projects.filter(r=>r.road_group);
 const hgabIds=new Set(groups.flatMap(g=>g.leftover_ids));
 const nepIds=new Set(payload.nep_leftover_groups.flatMap(g=>g.leftover_nep_ids));
 const flaggedHgab=flagged.filter(r=>r.road_group.flag==='insertion_candidate_group_exhausted');
 const flaggedNep=flagged.filter(r=>r.road_group.flag==='deletion_candidate_group_house_paired');
 assert.equal(flaggedHgab.length,hgabIds.size);
 assert.equal(flaggedNep.length,nepIds.size);
 assert.deepEqual([...new Set(flaggedHgab.map(r=>r.house.id))].sort(),[...hgabIds].sort());
 assert.deepEqual([...new Set(flaggedNep.map(r=>r.nep.id))].sort(),[...nepIds].sort());
 for(const row of flaggedHgab){
  assert.equal(row.road_group.flag,'insertion_candidate_group_exhausted');
  assert.match(row.reason,/Same-(road corridor|project shell)/); }
 for(const row of flaggedNep){
  assert.match(row.reason,/Dropped or re-titled candidate/);
  assert.equal(row.road_group.leftover_nep_rows>0,true); }
});

test('per-km profile computes spread from measurable members',()=>{
 const group=groups.find(g=>g.members.some(m=>m.amount_per_km_php!=null));
 assert.ok(group,'at least one group has measurable per-km members');
 const profile=groupPerKmProfile(group);
 const values=group.members.filter(m=>m.amount_per_km_php!=null).map(m=>m.amount_per_km_php).sort((a,b)=>a-b);
 assert.equal(profile.min,values[0]);
 assert.equal(profile.max,values[values.length-1]);
 assert.equal(profile.measurable,values.length);
 assert.ok(profile.spread>=1);
 const empty=groupPerKmProfile({members:[{amount_per_km_php:null}]});
 assert.equal(empty,null);
});

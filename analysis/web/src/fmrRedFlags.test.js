import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFmrRedFlags, redFlagOptions, RED_FLAG_DEFAULTS} from './fmrRedFlags.js';
const segment = (km=1, coordinates=[[120,14],[120.01,14]]) => ({coordinates,straight_line_distance_km:km});
const project = (id, overrides={}) => ({id,region_key:'I',amount_php:100000,status:'normalized',review_flags:[],segments:[segment()],segment_count:1,...overrides});
const data = (nep,house=[],comparison=[]) => ({stages:{nep:{projects:nep},house:{projects:house}},comparison});
const flags = row => row.flags.map(f=>f.id);
test('strict short threshold and project allocation counted once across sections',()=>{
 const rows=buildFmrRedFlags(data([project('boundary',{segments:[segment(.1)]}),project('short',{segments:[segment(.099)]}),project('multi',{segments:[segment(1),segment(2,[[121,14],[121.01,14]])],segment_count:2})]),'nep').rows;
 assert.ok(!flags(rows[0]).includes('short_span'));assert.ok(flags(rows[1]).includes('short_span'));
 assert.equal(rows[2].meters,3000);assert.equal(rows[2].proxyPhpPerMeter,100000/3000);
});
test('partial, zero, unresolved and repeated geometry cannot produce rate proxies',()=>{
 const rows=buildFmrRedFlags(data([project('partial',{segment_count:2}),project('zero',{segments:[segment(0)]}),project('review',{status:'needs_review'}),project('repeat',{segments:[segment(),segment(1,[[120.01,14],[120,14]])],segment_count:2})]),'nep').rows;
 assert.ok(rows.every(r=>r.proxyPhpPerMeter===null));assert.equal(rows[0].meters,null);
 assert.ok(flags(rows[0]).includes('missing_geometry'));assert.ok(flags(rows[1]).includes('zero_span'));assert.ok(flags(rows[3]).includes('repeated_sections'));
});
test('shared exact footprints match reversed direction only within selected document',()=>{
 const result=buildFmrRedFlags(data([project('a'),project('b',{segments:[segment(1,[[120.01,14],[120,14]])]}),project('c',{segments:[segment(1,[[121,14],[121.01,14]])]})],[project('house')]),'nep');
 assert.deepEqual(result.rows[0].flags.find(f=>f.id==='shared_geometry').peerIds,['b']);assert.ok(!flags(result.rows[2]).includes('shared_geometry'));
});
test('peer outliers require minimum cohort and both median multiple and outer fence',()=>{
 const projects=Array.from({length:20},(_,i)=>project(String(i),{amount_php:i===19?1000000:100000}));
 const result=buildFmrRedFlags(data(projects),'nep');assert.ok(flags(result.rows[19]).includes('high_proxy'));assert.equal(result.rows[19].benchmark.count,20);
 assert.equal(buildFmrRedFlags(data(projects.slice(1)),'nep').rows[18].benchmark,null);
 assert.ok(!flags(buildFmrRedFlags(data(projects),'nep',{costMultiple:11}).rows[19]).includes('high_proxy'));
 const varied=Array.from({length:20},(_,i)=>project(String(i),{amount_php:i<10?100000:400000}));
 assert.ok(!flags(buildFmrRedFlags(data(varied),'nep',{costMultiple:1}).rows[19]).includes('high_proxy'));
});
test('regional cohort falls back to whole source when below twenty eligible projects',()=>{
 const projects=Array.from({length:21},(_,i)=>project(String(i),{region_key:i===20?'II':'I'}));
 const rows=buildFmrRedFlags(data(projects),'nep').rows;assert.equal(rows[0].benchmark.scope,'Region I');assert.equal(rows[20].benchmark.scope,'Whole source');
});
test('candidate increase requires exact complete geometry and preserves source data',()=>{
 const input=data([project('n')],[project('h',{amount_php:150000})],[{id:'pair',status:'paired',nep_id:'n',house_id:'h',method:'coordinates'}]);
 const before=JSON.stringify(input);assert.ok(flags(buildFmrRedFlags(input,'house').rows[0]).includes('allocation_increase'));assert.equal(JSON.stringify(input),before);
 input.stages.house.projects[0].segments=[segment(1,[[121,14],[121.01,14]])];assert.ok(!flags(buildFmrRedFlags(input,'house').rows[0]).includes('allocation_increase'));
});
test('invalid threshold settings use defaults',()=>{
 assert.deepEqual(redFlagOptions({shortMeters:'',longKm:-1,costMultiple:0,increasePercent:'bad'}),RED_FLAG_DEFAULTS);
 assert.equal(redFlagOptions({increasePercent:0}).increasePercent,0);
});

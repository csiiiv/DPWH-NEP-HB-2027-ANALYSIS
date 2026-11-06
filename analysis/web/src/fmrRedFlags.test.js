import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFmrRedFlags, collapseIdenticalFmrReviews, sharedCoordinateEvidence, summarizeFmrReviews, redFlagOptions, RED_FLAG_DEFAULTS} from './fmrRedFlags.js';
const segment = (km=1, coordinates=[[120,14],[120.01,14]]) => ({coordinates,straight_line_distance_km:km});
const project = (id, overrides={}) => ({id,region_key:'I',amount_php:100000,status:'normalized',review_flags:[],segments:[segment()],segment_count:1,...overrides});
const data = (nep,house=[],comparison=[]) => ({stages:{nep:{projects:nep},house:{projects:house}},comparison});
const flags = row => row.flags.map(f=>f.id);
test('combined review retains source attribution without mixing peer baselines or shared geometry',()=>{
 const nep=Array.from({length:20},(_,i)=>project(`n${i}`));
 const house=Array.from({length:20},(_,i)=>project(`h${i}`,{amount_php:1000000}));
 const input=data(nep,house), before=JSON.stringify(input);
 const combined=buildFmrRedFlags(input,'all');
 assert.deepEqual(combined.rows,[...buildFmrRedFlags(input,'nep').rows,...buildFmrRedFlags(input,'house').rows]);
 assert.equal(combined.eligibleRates,40);
 assert.equal(combined.rows[0].stageKey,'nep');
 assert.equal(combined.rows[20].stageKey,'house');
 assert.equal(combined.rows[20].benchmark.median,10*combined.rows[0].benchmark.median);
 assert.ok(combined.rows[0].flags.find(f=>f.id==='shared_geometry').peerIds.every(id=>id.startsWith('n')));
 assert.equal(JSON.stringify(input),before);
});
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

test('Tampac I printed longitude triggers a resolved long-span flag in both sources',()=>{
 for (const [stage,id] of [['nep','nep_fmr:p18:r15'],['house','ib:p685:r5']]) {
   const p=project(id,{points:[
     {id:id+':point1',longitude:120.7972783,latitude:15.6352648},
     {id:id+':point2',longitude:120.8030109,latitude:15.6377206}],
     segments:[{...segment(.67,[[120.7972783,15.6352648],[120.8030109,15.6377206]]),
       point_ids:[id+':point1',id+':point2']}],
     normalization_rules:['off_by_one_digit_repair_accepted']});
   const input=data(stage==='nep'?[p]:[],stage==='house'?[p]:[]);
   const before=JSON.stringify(input),row=buildFmrRedFlags(input,stage).rows[0];
   assert.ok(row.meters>900000);
   assert.equal(row.originalProject.segments[0].coordinates[1][0],129.8030109);
   assert.equal(row.project.segments[0].coordinates[1][0],120.8030109);
   assert.ok(row.corrected.meters<1000);
   assert.equal(row.flags.find(f=>f.id==='long_span').resolution,'Resolved by accepted correction');
   assert.ok(!row.openFlags.some(f=>f.id==='long_span'));
   assert.equal(JSON.stringify(input),before);
 }
});
test('unavailable printed repair reading remains missing rather than borrowing accepted geometry',()=>{
 const id='ib:p670:r4',p=project(id,{points:[{id:id+':point1',longitude:120.5,latitude:18.1},
 {id:id+':point2',longitude:120.53601,latitude:18.153581}],
 segments:[{...segment(),point_ids:[id+':point1',id+':point2']}]});
 const row=buildFmrRedFlags(data([],[p]),'house').rows[0];
 assert.equal(row.meters,null);assert.ok(flags(row).includes('missing_geometry'));
 assert.equal(row.originalProject.points[1].longitude,null);
});

test('only unique identical cross-source candidates collapse, retaining both evidence objects',()=>{
 const n=project('n',{title:'Exact title',source:{source_pdf:'NEP.pdf',pdf_page:1}});
 const h={...n,id:'h',source:{source_pdf:'House.pdf',pdf_page:99}};
 const pair=[{status:'paired',nep_id:'n',house_id:'h'}];
 const rows=buildFmrRedFlags(data([n],[h],pair),'all').rows,before=JSON.stringify(rows);
 const groups=collapseIdenticalFmrReviews(rows,pair);
 assert.equal(groups.length,1);assert.equal(groups[0].members.length,2);
 assert.equal(groups[0].budgetSourceLabel,'NEP+HGAB');
 assert.deepEqual(collapseIdenticalFmrReviews(rows,[]).map(r=>r.budgetSourceLabel),['NEP ONLY','HGAB ONLY']);
 assert.equal(groups[0].members[1].project.source.pdf_page,99);
 assert.equal(JSON.stringify(rows),before);
 for(const patch of [{title:'Different title'},{amount_php:100001},
   {segments:[segment(1.001)]},{coordinates:[[[120,14],[120.02,14]]]},
   {segments:[segment(1,[[120,14],[120.02,14]])]}]) {
   const changed=buildFmrRedFlags(data([n],[{...h,...patch}],pair),'all').rows;
   assert.equal(collapseIdenticalFmrReviews(changed,pair).length,2,JSON.stringify(patch));
 }
 assert.equal(collapseIdenticalFmrReviews(rows,[]).length,2);
 assert.equal(collapseIdenticalFmrReviews(rows,[...pair,...pair]).length,2);
});

test('OCR text and processing history do not split otherwise identical matched projects',()=>{
 const n=project('n',{title:'Construction of Brgy. Tagumpay FMR',coordinates_raw:'S51: 14.6, 121.5',
   normalization_rules:['image_reviewed_ocr_transcription'],coordinate_text_basis:'image_reviewed_ocr_transcription'});
 const h=project('h',{title:'Construction of Barangay Tagumpay FMR.',coordinates_raw:'S1:14.6 121.5',
   normalization_rules:[],coordinate_text_basis:'original_ocr'});
 const comparison=[{status:'paired',nep_id:'n',house_id:'h'}];
 const rows=buildFmrRedFlags(data([n],[h],comparison),'all').rows;
 const groups=collapseIdenticalFmrReviews(rows,comparison);
 assert.equal(groups.length,1);
 assert.equal(groups[0].budgetSourceLabel,'NEP+HGAB');
 assert.equal(groups[0].members[0].project.coordinates_raw,n.coordinates_raw);
 assert.equal(groups[0].members[1].project.coordinates_raw,h.coordinates_raw);
});

test('shared-coordinate evidence includes current and peers from the same source with matching sections marked',()=>{
 const n=project('n',{title:'Current',source:{source_pdf:'NEP.pdf',pdf_page:1}});
 const peer=project('peer',{title:'Other title',source:{source_pdf:'NEP.pdf',pdf_page:2},segments:[segment(1,[[120.01,14],[120,14]]),segment(1,[[121,14],[121.01,14]])],segment_count:2});
 const input=data([n,peer],[project('house')]),before=JSON.stringify(input);
 const row=buildFmrRedFlags(input,'nep').rows.find(row=>row.id==='n');
 const evidence=sharedCoordinateEvidence(input,row);
 assert.deepEqual(evidence.map(r=>r.project.id),['n','peer']);
 assert.equal(evidence[0].current,true);assert.equal(evidence[1].current,false);
 assert.deepEqual(evidence[1].segments.map(s=>s.shared),[true,false]);
 assert.equal(evidence[1].project.source.pdf_page,2);
 assert.equal(JSON.stringify(input),before);
});

test('headline counts and allocation remove identical matched-source overlap only',()=>{
 const n=project('n',{title:'Same project',amount_php:15000000,segments:[segment(.05)]});
 const h={...n,id:'h'},pair=[{status:'paired',nep_id:'n',house_id:'h'}];
 const groups=collapseIdenticalFmrReviews(buildFmrRedFlags(data([n],[h],pair),'all').rows,pair);
 const summary=summarizeFmrReviews(groups);
 assert.equal(summary.flaggedEntries,1);assert.equal(summary.sourceRecords,2);
 assert.equal(summary.flaggedAllocation,15000000);assert.equal(summary.findings,1);
 const differing=collapseIdenticalFmrReviews(buildFmrRedFlags(data([n],[{...h,amount_php:20000000}],pair),'all').rows,pair);
 assert.equal(summarizeFmrReviews(differing).flaggedEntries,2);
 assert.equal(summarizeFmrReviews(differing).flaggedAllocation,35000000);
 assert.equal(summarizeFmrReviews(groups.filter(g=>g.budgetSource==='nep')).entries,0);
});

test('flag multiplicity partitions entries without counting a multi-flag entry twice',()=>{
 const make=(ids)=>({flagCount:ids.length,flags:ids.map(id=>({id})),project:{amount_php:100},
   members:[{hasCorrection:false,resolvedFlags:[],openFlags:[]}]});
 const s=summarizeFmrReviews([make(['a']),make(['a','b']),make(['a','b','c'])]);
 assert.equal(s.flaggedEntries,3);assert.equal(s.findings,6);
 assert.deepEqual(s.flagMultiplicity,{'1':1,'2':1,'3plus':1});
 assert.equal(Object.values(s.flagMultiplicity).reduce((a,b)=>a+b,0),s.flaggedEntries);
 const duplicate=summarizeFmrReviews([make(['a','a'])]);
 assert.equal(duplicate.findings,1);assert.equal(duplicate.flagMultiplicity['1'],1);
});

test('default long-span threshold is strictly greater than twenty kilometers',()=>{
 const projects=[project('below',{segments:[segment(19.999)]}),
 project('boundary',{segments:[segment(20)]}),project('above',{segments:[segment(20.001)]})];
 const rows=buildFmrRedFlags(data(projects),'nep').rows;
 assert.equal(RED_FLAG_DEFAULTS.longKm,20);
 assert.ok(!flags(rows[0]).includes('long_span'));
 assert.ok(!flags(rows[1]).includes('long_span'));
 assert.ok(flags(rows[2]).includes('long_span'));
});

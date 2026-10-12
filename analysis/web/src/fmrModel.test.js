import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationStats, bandRows, candidateAggregates, chainageRows, comparisonRows, csvText, filterComparisons,
  filterProjects, formatKm, hadCoordinateInterpretation, overviewRegionRows, projectLengthKm, regionAllocationRows, repeatedAmounts, roundingLadder} from './fmrModel.js';

const projects = [
  {id:'p1',title:'Barangay A FMR',region:'Region I',region_key:'I',status:'normalized',review_flags:[],original_review_flags:[],normalization_rules:[],segment_count:4,amount_php:20},
  {id:'p2',title:'Barangay B FMR',region:'Region II',region_key:'II',status:'needs_review',review_flags:['invalid_coordinate_pair'],original_review_flags:['coordinate_format_needs_review'],normalization_rules:['longitude_first_reordered'],segment_count:1,amount_php:10},
];
const interpreted = {id:'p3',title:'Barangay C FMR',region:'Region I',region_key:'I',status:'normalized',review_flags:[],original_review_flags:['nonstandard_endpoint_marker'],normalization_rules:['endpoint_marker_typo_normalized'],segment_count:1,amount_php:15};
test('allocations count projects once despite multiple segments', () => {
  assert.deepEqual(allocationStats(projects),{count:2,total:30,mean:15,median:15,min:10,max:20,review:1,multi:1});
  assert.equal(allocationStats([]).median,null);
});
test('filters combine region, terms and coordinate findings without mutating the ledger', () => {
  assert.deepEqual(filterProjects(projects,{q:'barangay a',region:'I',status:'multi'}),[projects[0]]);
  assert.deepEqual(filterProjects(projects,{q:'invalid_coordinate',status:'needs_review'}),[projects[1]]);
  assert.equal(filterProjects(projects,{q:'absent'}).length,0);
  assert.equal(projects.length,2);
});
test('interpreted filter finds projects with original flags or normalization rules', () => {
  const mixed = [...projects, interpreted];
  assert.equal(hadCoordinateInterpretation(projects[0]), false);
  assert.equal(hadCoordinateInterpretation(interpreted), true);
  assert.deepEqual(filterProjects(mixed,{status:'interpreted'}).map(p => p.id), ['p2','p3']);
  assert.deepEqual(filterProjects(mixed,{q:'endpoint_marker_typo'}).map(p => p.id), ['p3']);
});
test('missing counterparts have null amounts; search can find either source title', () => {
  const rows = comparisonRows({stages:{nep:{projects:[projects[0]]},house:{projects:[projects[1]]}},comparison:[
    {nep_id:'p1',house_id:'p2',status:'paired',delta_php:-10,region_key:'I'},
    {nep_id:null,house_id:'p2',status:'house_only',delta_php:null,region_key:'II'},
  ]});
  assert.equal(rows[1].nep_php,null);
  assert.equal(rows[1].delta_php,null);
  assert.deepEqual(filterComparisons(rows,{q:'barangay a',status:'changed'}),[rows[0]]);
  assert.equal(filterComparisons(rows,{status:'nep_only'}).length,0);
});
test('candidate filters split paired direction and repeated titles', () => {
  const rows = [
    {status:'paired',delta_php:5,ambiguous_title:false,nep_id:'a',house_id:'b'},
    {status:'paired',delta_php:-2,ambiguous_title:false,nep_id:'c',house_id:'d'},
    {status:'paired',delta_php:0,ambiguous_title:false,nep_id:'e',house_id:'f'},
    {status:'house_only',delta_php:null,ambiguous_title:true,house_id:'g'},
  ];
  assert.equal(filterComparisons(rows,{status:'increased'}).length,1);
  assert.equal(filterComparisons(rows,{status:'decreased'}).length,1);
  assert.equal(filterComparisons(rows,{status:'unchanged'}).length,1);
  assert.deepEqual(filterComparisons(rows,{status:'ambiguous'})[0].house_id,'g');
});
test('candidate aggregates reconcile the money identity and split directions', () => {
  const rows = [
    {status:'paired',delta_php:100,house_php:200,nep_php:100},
    {status:'paired',delta_php:-40,house_php:60,nep_php:100},
    {status:'house_only',house_php:300,nep_php:null},
    {status:'nep_only',house_php:null,nep_php:50},
  ];
  const a = candidateAggregates(rows);
  assert.deepEqual(a.counts,{paired:2,house_only:1,nep_only:1});
  assert.deepEqual(a.increased,{count:1,amount:100});
  assert.deepEqual(a.decreased,{count:1,amount:40});
  assert.equal(a.unchanged,0);
  assert.equal(a.net_delta_php,100 - 40 + 300 - 50);
});
test('CSV preserves numeric signs and quoted source text but escapes spreadsheet formulas', () => {
  const csv = csvText(['title','amount','id'],[['="formula"',-10,null],['line\nbreak',20,'p:1']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=\"\"formula\"\"","-10",""'));
  assert.ok(csv.includes('"line\nbreak","20","p:1"'));
});
test('endpoint distance drives length and per-km without counting point-only rows', () => {
  const withLength = {id:'p1',amount_php:1000,segments:[{straight_line_distance_km:1.5},{straight_line_distance_km:null}],status:'normalized',review_flags:[],segment_count:2,point_count:3,region_key:'I',region:'Region I',title:'A',source:{}};
  const pointOnly = {id:'p2',amount_php:500,segments:[{straight_line_distance_km:null}],status:'normalized',review_flags:[],segment_count:1,point_count:1,region_key:'I',region:'Region I',title:'B',source:{}};
  assert.equal(projectLengthKm(withLength),1.5);
  assert.equal(projectLengthKm(pointOnly),null);
  const rows = chainageRows([withLength, pointOnly]);
  assert.equal(rows.find(r => r.id==='p1').per_km_php,1000/1.5);
  assert.equal(rows.find(r => r.id==='p2').point_only,true);
  assert.equal(rows.find(r => r.id==='p2').included,false);
  assert.equal(formatKm(1.5),'1.5 km');
});
test('bands classify every measurable row exactly once', () => {
  const rows = [{amount_php:10,length_km:1},{amount_php:30,length_km:1},{amount_php:1,length_km:0}];
  const bands = bandRows(rows,'amount_php',[[0,20,'low'],[20,Infinity,'high']]);
  assert.deepEqual(bands.map(b => b.projects),[2,1]);
  assert.equal(bands[0].total_km,1);
});
test('overview regions derive project deltas and allocation percent', () => {
  const rows = overviewRegionRows([{id:'I',label:'Region I',nep_php:100,house_php:150,nep_count:3,house_count:4}]);
  assert.equal(rows[0].delta_projects,1);
  assert.equal(rows[0].pct_alloc,50);
});
test('rounding ladder shares sum to one and repeated amounts need five repeats', () => {
  const mixed = [{amount_php:5e6},{amount_php:5e6},{amount_php:1e7},{amount_php:15e6},{amount_php:123}];
  const ladder = roundingLadder(mixed);
  assert.equal(ladder.map(r => r.projects).reduce((a,b) => a+b,0),5);
  assert.ok(Math.abs(ladder.reduce((s,r) => s + r.share,0) - 1) < 1e-9);
  assert.equal(roundingLadder([{amount_php:5e6},{amount_php:5e6},{amount_php:5e6}]).find(r => r.step === 5e6).projects,3);
  const repeats = repeatedAmounts([{amount_php:5e6,title:'A'},{amount_php:5e6,title:'B'},{amount_php:5e6,title:'C'},{amount_php:5e6,title:'D'},{amount_php:5e6,title:'E'},{amount_php:7e6,title:'F'}],5);
  assert.equal(repeats.length,1);
  assert.equal(repeats[0].projects,5);
});
test('region allocation rows carry stats and coordinate tallies', () => {
  const regions = [{key:'I',label:'Region I'}];
  const rows = regionAllocationRows(projects, regions);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r => r.count),[1,1]);
  assert.equal(rows.find(r => r.key==='II').review,1);
});

test('source paths and arithmetic use the full branch rather than filtered projects', async () => {
  const {sourcePath,sourceNode,sourceArithmetic}=await import('./fmrModel.js');
  const stage={root:{id:'root',label:'Program',printed_amount_php:30},regions:[{id:'r',label:'Region',amount_php:30,project_ids:['p1','p2']}],projects};
  assert.deepEqual(sourcePath(stage,'p1').map(n => n.id),['root','r','p1']);
  assert.deepEqual(sourcePath(stage,'r').map(n => n.label),['Program','Region']);
  assert.equal(sourceNode(stage,'p1').label,'Barangay A FMR');
  assert.equal(sourceNode(stage,'absent'),null);
  assert.deepEqual(sourceArithmetic(stage,'root'),{printed:30,child_sum:30,leaf_sum:30,leaf_count:2,difference:0});
  assert.equal(sourceArithmetic(stage,'r').leaf_count,2);
  assert.equal(sourceArithmetic(stage,'p1').child_sum,null);
  assert.equal(sourceArithmetic({...stage,root:{...stage.root,printed_amount_php:31}},'root').difference,1);
});
test('review category counts overlap but count a project once per flag', async () => {
  const {coordinateCategories}=await import('./fmrModel.js');
  const rows=[{review_flags:['a','b','a']},{review_flags:['a']}];
  assert.deepEqual(coordinateCategories(rows),[{id:'a',label:'a',count:2},{id:'b',label:'b',count:1}]);
  assert.deepEqual(filterProjects(projects,{category:'invalid_coordinate_pair'}),[projects[1]]);
});
test('direction, method and coordinate constraints intersect independently', () => {
  const rows=[{id:'a',status:'paired',delta_php:10,method:'title',nep:projects[0],house:projects[1]},
    {id:'b',status:'house_only',delta_php:null,method:null,house:projects[1]}];
  assert.deepEqual(filterComparisons(rows,{direction:'increased',method:'title',coordinate:'needs_review'}).map(r => r.id),['a']);
  assert.equal(filterComparisons(rows,{direction:'unchanged'}).length,0);
  assert.deepEqual(filterComparisons(rows,{coordinate:'multi'}).map(r => r.id),['a']);
});
test('comparison provenance filters cover extraction flags, rules, remaining flags and side scope', () => {
  const nep = {...projects[0], original_review_flags:['nonstandard_endpoint_marker'], normalization_rules:['endpoint_marker_typo_normalized'], review_flags:[], coordinate_text_basis:'original_ocr'};
  const house = {...projects[1], original_review_flags:['coordinate_format_needs_review'], normalization_rules:['longitude_first_reordered'], review_flags:['invalid_coordinate_pair'], coordinate_text_basis:'image_reviewed_ocr_transcription'};
  const rows = [
    {id:'pair', status:'paired', delta_php:1, method:'title', nep, house, nep_id:nep.id, house_id:house.id},
    {id:'house_only', status:'house_only', delta_php:null, method:null, nep:null, house, house_id:house.id},
  ];
  assert.deepEqual(filterComparisons(rows,{extraction:'nonstandard_endpoint_marker'}).map(r => r.id), ['pair']);
  assert.deepEqual(filterComparisons(rows,{rule:'longitude_first_reordered'}).map(r => r.id), ['pair','house_only']);
  assert.deepEqual(filterComparisons(rows,{review_flag:'invalid_coordinate_pair', coord_side:'house'}).map(r => r.id), ['pair','house_only']);
  assert.deepEqual(filterComparisons(rows,{text_basis:'image_reviewed_ocr_transcription', coord_side:'nep'}).map(r => r.id), []);
  assert.deepEqual(filterComparisons(rows,{coordinate:'interpreted', coord_side:'both'}).map(r => r.id), ['pair']);
  assert.deepEqual(filterComparisons(rows,{q:'endpoint_marker_typo'}).map(r => r.id), ['pair']);
});
test('comparison exports preserve source provenance and unavailable amounts', async () => {
  const {comparisonExportRows}=await import('./fmrModel.js');
  const p={...projects[0],source:{source_pdf:'source.pdf',pdf_page:4,printed_page:100}};
  const [exported]=comparisonExportRows([{id:'candidate',house:p,house_php:20,nep:null,nep_php:null,delta_php:null,status:'house_only'}]);
  assert.equal(exported.nep,null);
  assert.equal(exported.delta_php,null);
  assert.equal(exported.percent_change,null);
  assert.deepEqual(exported.house.source,p.source);
});
test('missing sort values sink in both directions without mutating input', async () => {
  const {sortRows}=await import('./fmrModel.js');
  const rows=[{id:'missing',value:null},{id:'high',value:20},{id:'low',value:10}];
  assert.deepEqual(sortRows(rows,r => r.value,{key:'value',direction:'desc'}).map(r => r.id),['high','low','missing']);
  assert.deepEqual(sortRows(rows,r => r.value,{key:'value',direction:'asc'}).map(r => r.id),['low','high','missing']);
  assert.equal(rows[0].id,'missing');
});

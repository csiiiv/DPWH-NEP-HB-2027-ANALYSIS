import test from 'node:test';
import assert from 'node:assert/strict';
import {exportResults,exportFileName} from './comparisonExport.js';
test('filtered exports preserve exact amounts, missing values, scope and safe CSV titles',()=>{
 const rows=[{id:'one',title:'=SUM(A1)\n"road"',program:'Roads',second:{amount_php:12000001},third:{amount_php:13000001},reading_delta_php:1000000}];
 const finding={tab:'projects',query:'road'};
 const json=JSON.parse(exportResults(rows,finding,'json'));
 assert.deepEqual(json.rows,rows);assert.deepEqual(json.finding,finding);assert.equal(json.amount_unit,'PHP');
 const csv=exportResults(rows,finding,'csv');assert.ok(csv.includes('"13000001"'));assert.ok(csv.includes('"\'=SUM(A1)\n""road"""'));assert.ok(csv.includes('"","","12000001"'));
});
test('export filenames describe the active filters and stay filesystem-safe',()=>{
 const empty={tab:'projects'};
 assert.equal(exportFileName(empty,'csv'),'dpwh-view-projects.csv');
 const full={tab:'projects',query:'Tandayag Br. (B00091PW)',program:'Bridge Program',region:'Region VI',office:'Ilocos Norte DEO',trace:'fuzzy_candidate',readingStatus:'third_only',regionMatching:'ignore',column:'2',direction:'-1'};
 assert.equal(exportFileName(full,'json'),
  'dpwh-view-projects_q-Tandayag-Br-B00091PW_program-Bridge-Program_region-Region-VI_deo-Ilocos-Norte-DEO_match-fuzzy_candidate_reading-third_only_regionmatch-ignore_sort-2_dir-1.json');
 // Long queries are capped per segment so names stay usable.
 assert.ok(exportFileName({tab:'projects',query:'x'.repeat(300)},'csv').length<200);
});

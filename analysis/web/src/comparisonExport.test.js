import test from 'node:test';
import assert from 'node:assert/strict';
import {exportResults,exportFileName,comparisonEvidence} from './comparisonExport.js';
test('filtered exports preserve exact amounts, missing values, scope and safe CSV titles',()=>{
 const rows=[{id:'one',title:'=SUM(A1)\n"road"',program:'Roads',second:{amount_php:12000001},third:{amount_php:13000001},reading_delta_php:1000000}];
 const finding={tab:'projects',query:'road'};
 const json=JSON.parse(exportResults(rows,finding,'json'));
 assert.deepEqual(json.rows[0].second,rows[0].second);assert.deepEqual(json.rows[0].third,rows[0].third);assert.deepEqual(json.finding,finding);assert.equal(json.amount_unit,'PHP');
 const csv=exportResults(rows,finding,'csv');assert.ok(csv.includes('"13000001"'));assert.ok(csv.includes('"\'=SUM(A1)\n""road"""'));assert.ok(csv.includes('"","","12000001"'));
});
test('evidence exports retain all grouped pages, both readings, gaps and missing counterparts',()=>{
 const row={id:'pair',nep:{id:'nep1',source:{source_pdf:'NEP.pdf',pdf_page:8}},
  second:{records:[{source_record_id:'s1',pdf_page:12},{source_record_id:'s2',pdf_pages:[14,12]}]},
  third:{id:'t1',pdf_pages:[15,16]}};
 const evidence=comparisonEvidence(row,{tab:'projects'});
 assert.equal(evidence.nep_source_pdf,'NEP.pdf');assert.equal(evidence.nep_pdf_page,'8');
 assert.equal(evidence.house_second_pdf_page,'12,14');assert.equal(evidence.house_second_source_id,'s1,s2');
 assert.equal(evidence.house_pdf_page,'15,16');assert.equal(evidence.house_third_pdf_page,'15,16');
 assert.equal(evidence.house_second_source_pdf,'HB_BUDGET/3 - HB 10858 VOL IC.pdf');
 assert.ok(evidence.house_third_source_pdf.includes('HB_BUDGET_3rd_reading/'));
 assert.equal(comparisonEvidence({nep:row.nep},{tab:'projects'}).house_pdf_page,null);
 const gap=comparisonEvidence({id:'gap',pdf_page:22},{tab:'gaps'});
 assert.equal(gap.nep_pdf_page,'22');assert.equal(gap.house_source_pdf,null);
 assert.equal(comparisonEvidence({id:'control'},{tab:'paps'}).nep_pdf_page,null);
 const json=JSON.parse(exportResults([row],{tab:'projects'},'json'));
 assert.equal(json.rows[0].house_second_pdf_page,'12,14');
 const csv=exportResults([{id:'reading',second:{amount_php:10},third:{amount_php:20}}],{tab:'readings'},'csv').split('\r\n');
 assert.equal(csv[0].split(',').length,csv[1].split(',').length);
 assert.equal(csv[0].includes('house_source_pdf'),true);
 assert.equal(row.house_source_pdf,undefined,'exports never mutate retained rows');
});
test('export filenames describe the active filters and stay filesystem-safe',()=>{
 const empty={tab:'projects'};
 assert.equal(exportFileName(empty,'csv'),'dpwh-view-projects.csv');
 const full={tab:'projects',query:'Tandayag Br. (B00091PW)',program:'Bridge Program',region:'Region VI',office:'Ilocos Norte DEO',matchStatus:'fuzzy',flag:'amount_increase',readingStatus:'third_only',regionMatching:'ignore',column:'2',direction:'-1'};
 assert.equal(exportFileName(full,'json'),
  'dpwh-view-projects_q-Tandayag-Br-B00091PW_program-Bridge-Program_region-Region-VI_deo-Ilocos-Norte-DEO_match-fuzzy_flag-amount_increase_reading-third_only_regionmatch-ignore_sort-2_dir-1.json');
 // Long queries are capped per segment so names stay usable.
 assert.ok(exportFileName({tab:'projects',query:'x'.repeat(300)},'csv').length<200);
});

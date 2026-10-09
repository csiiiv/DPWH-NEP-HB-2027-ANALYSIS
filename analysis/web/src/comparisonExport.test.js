import test from 'node:test';
import assert from 'node:assert/strict';
import {exportResults} from './comparisonExport.js';
test('filtered exports preserve exact amounts, missing values, scope and safe CSV titles',()=>{
 const rows=[{id:'one',title:'=SUM(A1)\n"road"',program:'Roads',second:{amount_php:12000001},third:{amount_php:13000001},reading_delta_php:1000000}];
 const finding={tab:'projects',query:'road'};
 const json=JSON.parse(exportResults(rows,finding,'json'));
 assert.deepEqual(json.rows,rows);assert.deepEqual(json.finding,finding);assert.equal(json.amount_unit,'PHP');
 const csv=exportResults(rows,finding,'csv');assert.ok(csv.includes('"13000001"'));assert.ok(csv.includes('"\'=SUM(A1)\n""road"""'));assert.ok(csv.includes('"","","12000001"'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {benford,trailingZeros,lastDigits,roundingLadder,valueBands,kmeansClusters,exactConcentrations,groupTotals,BANDS} from './analysisStats.js';
import {unifiedComparison} from './unifiedComparison.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));

test('digit statistics conserve record counts and match reference patterns',()=>{
 const rows=unifiedComparison(read('stage_trace_2027'),read('house_reading_changes_2027')).projects;
 const amounts=rows.filter(r=>r.third).map(r=>r.third.amount_php);
 assert.equal(amounts.length,16274);
 const b=benford(amounts);
 assert.equal(b.total,amounts.filter(v=>v>0).length);
 assert.ok(Math.abs(b.digits.reduce((sum,d)=>sum+d.observed,0)-1)<1e-9);
 assert.ok(b.mad>0&&b.mad<0.1);
 const zeros=trailingZeros(amounts);
 assert.equal(zeros.counts.reduce((sum,n)=>sum+n,0),zeros.total);
 const last=lastDigits(amounts);
 assert.equal(last.counts.reduce((sum,n)=>sum+n,0),last.total);
 const ladder=roundingLadder(amounts);
 assert.equal(ladder.length,6);
 const million=ladder.find(e=>e.step===1e6);
 assert.equal(million.records,12702);assert.equal(million.share,12702/16274);
 const bands=valueBands(amounts);
 assert.equal(bands.reduce((sum,e)=>sum+e.records,0),amounts.length);
 assert.equal(bands.reduce((sum,e)=>sum+e.amount_php,0),amounts.reduce((sum,v)=>sum+v,0));
 assert.ok(BANDS.length===8);
});

test('k-means and exact concentrations return stable, conserved summaries',()=>{
 const rows=unifiedComparison(read('stage_trace_2027'),read('house_reading_changes_2027')).projects;
 const flat=rows.filter(r=>r.third).map(r=>({amount_php:r.third.amount_php,program:r.third.program||r.program||'Unrecorded',title:r.title}));
 const clusters=kmeansClusters(flat.map(r=>r.amount_php),5);
 assert.ok(clusters.length>=1&&clusters.length<=5);
 assert.ok(Math.abs(clusters.reduce((sum,c)=>sum+c.share,0)-1)<1e-9);
 const again=kmeansClusters(flat.map(r=>r.amount_php),5);
 assert.deepEqual(again,clusters);
 const concentrations=exactConcentrations(flat,5);
 for(const entry of concentrations){
   assert.ok(entry.records>=5);
   assert.equal(entry.field,'program');
   assert.ok(entry.group);
   assert.equal(entry.total_php,entry.amount_php*entry.records);
   assert.equal(new Set(entry.examples).size,entry.examples.length);
 }
 const totals=groupTotals(flat,'program');
 assert.equal(totals.reduce((sum,e)=>sum+e.rows,0),flat.length);
 assert.equal(totals.reduce((sum,e)=>sum+e.amount_php,0),flat.reduce((sum,e)=>sum+e.amount_php,0));
});

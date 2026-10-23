import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
const report=JSON.parse(readFileSync(new URL('../outputs/official_crosscheck_report.json',import.meta.url),'utf8'));
test('official benchmark has no missing sources and is transparent about failures',()=>{
 assert.equal(report.summary.checked,107);
 assert.ok(report.summary.wrong_assignment>0,'the pinned provisional source has a known wrong assignment');
 assert.equal(report.summary.checked,report.summary.agreement+report.summary.wrong_assignment+report.summary.source_conflict+report.summary.unmatched_seat+report.summary.unmapped);
 for(const row of report.findings)assert.ok(row.sourceUrl.startsWith('https://'));
});
test('statutory Baliuag district mismatch is explicitly reported',()=>{
 const record=report.findings.find(x=>x.source==='RA11546'&&x.place==='Baliuag');
 assert.equal(record.expectedDistrictId,'leg:bulacan:2nd');
 assert.equal(record.observedDistrictId,'leg:bulacan:4th');
 assert.equal(record.verdict,'wrong_assignment');
});
test('Quezon City Commonwealth official district is not guessed from disputed sources',()=>{
 const row=report.findings.find(x=>x.source==='QC_COUNCIL'&&x.place==='Commonwealth');
 assert.equal(row.expectedDistrictId,'leg:quezon-city:2nd');
 assert.equal(row.verdict,'source_conflict');
});

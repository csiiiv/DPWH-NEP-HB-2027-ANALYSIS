import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDaAuditFlag} from './daAuditReview.js';

const row = {
  id:'pair:n:h', title:'Printed road', status:'paired',
  nep:{id:'n',title:'NEP title',amount_php:1200000,coordinates_raw:'10.1, 120.1',
    status:'needs_review',review_flags:['invalid_coordinate_pair'],
    location_agreement:'DISAGREE',psgc:[{where:'Other municipality, Iloilo'}]},
  house:{id:'h',title:'House title',amount_php:1300000,coordinates_raw:'10.2, 120.2',status:'normalized'},
  da:{match_side:'nep',from:{id:'da1',title:'DA original',amount_php:1000000,coordinates_raw:'10.0, 120.0',
    excel_row:37,control_no:'I-1',remarks:'Coordinate and title updates; reprioritized'},
    proposed:{id:'da2',title:'DA proposal',amount_php:1100000,coordinates_raw:'10.3, 120.3',
      excel_row:40,control_no:'I-2',remarks:'Coordinate and title updates; reprioritized'}},
};

test('amount flag shows printed and effective DA amounts and signed difference', () => {
  const info=describeDaAuditFlag(row,'nep_amount_diff_vs_da');
  assert.match(info.label,/NEP amount differs/);
  assert.equal(info.side,'nep');
  assert.deepEqual(info.fields.map(x=>x.value),['₱1,200,000','₱1,100,000','+₱100,000']);
  assert.match(info.explanation,/not evidence/);
});
test('dropped DA row compares to FROM rather than inventing a proposed amount', () => {
  const info=describeDaAuditFlag({...row,da:{...row.da,proposed:null}},'house_amount_diff_vs_da');
  assert.match(info.fields[1].label,/DA FROM/);
  assert.deepEqual(info.fields.map(x=>x.value),['₱1,300,000','₱1,000,000','+₱300,000']);
});
test('title and coordinate differences show source and DA values separately', () => {
  const title=describeDaAuditFlag(row,'house_title_diff_vs_da');
  const coord=describeDaAuditFlag(row,'nep_coord_diff_vs_da');
  assert.deepEqual(title.fields.map(x=>x.value),['House title','DA proposal']);
  assert.deepEqual(coord.fields.map(x=>x.value),['10.1, 120.1','10.3, 120.3']);
  assert.match(coord.explanation,/not a distance/);
});
test('printed review and PSGC flags do not masquerade as DA comparisons', () => {
  const status=describeDaAuditFlag(row,'nep_needs_review');
  const review=describeDaAuditFlag(row,'nep_review:invalid_coordinate_pair');
  const psgc=describeDaAuditFlag(row,'nep_psgc:DISAGREE');
  assert.match(status.explanation,/not a direct comparison/);
  assert.match(review.explanation,/printed-source review flag/);
  assert.ok(review.fields.some(x=>x.value==='invalid_coordinate_pair'));
  assert.match(psgc.explanation,/not a direct DA-versus-printed comparison/);
  assert.ok(psgc.fields.some(x=>x.value.includes('Other municipality, Iloilo')));
});
test('DA remark flags cite the exact remark and original/effective fields', () => {
  const info=describeDaAuditFlag(row,'da_remark_title_and_coordinates');
  assert.equal(info.side,null);
  assert.match(info.explanation,/keyword classification/);
  assert.ok(info.fields.some(x=>x.value.includes('Coordinate and title updates')));
  assert.ok(info.fields.some(x=>x.value==='10.0, 120.0'));
  assert.ok(info.fields.some(x=>x.value==='10.3, 120.3'));
  assert.ok(describeDaAuditFlag(row,'da_remark_reprioritized').fields.some(x=>x.value==='₱1,100,000'));
});
test('unknown codes and unavailable evidence remain explicit, never fabricated', () => {
  const unknown=describeDaAuditFlag({...row,da:{from:null,proposed:null}},'new_unknown_audit');
  assert.equal(unknown.fields[0].value,'new_unknown_audit');
  assert.equal(unknown.fields.at(-1).value,'Not recorded');
  const coord=describeDaAuditFlag({...row,house:{id:'h'}},'house_coord_diff_vs_da');
  assert.equal(coord.fields[0].value,'Not recorded');
});

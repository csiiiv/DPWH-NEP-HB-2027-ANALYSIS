import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesInsertionRanking,matchesDifferenceScope,dimensionValue,filterGroupProjects,compareHrefForGroup} from './groupProjects.js';

const houseOnly={id:'a',title:'A',program:'Bridge Program',pap:'PAP-1',region:'Region III',trace:'house_only_candidate',
 reading_status:'same_amount',third:{amount_php:1e6,region:'Region III',office:'Bulacan 1st DEO',program:'Bridge Program',pap:'PAP-1'},nep:null,api:null};
const unresolved={...houseOnly,id:'b',title:'B',trace:'fuzzy_candidate',suggestions:[{confidence:0.9,nep:{id:'n'}}]};
const matched={id:'c',title:'C',program:'Local Program',pap:'PAP-2',region:'NCR',trace:'candidate_increase',reading_status:'same_amount',
 third:{amount_php:3e6,region:'NCR',office:'Central Office',program:'Local Program',pap:'PAP-2'},
 nep:{amount_php:1e6,region:'NCR',office:'Central Office'}};
const thirdOnly={id:'d',title:'D',program:'Local Program',region:'NCR',trace:'house_only_candidate',reading_status:'third_only',
 third:{amount_php:5e6,region:'NCR',office:'',program:'Local Program'},nep:null,api:null};

test('insertion ranking membership matches headlineStats rules',()=>{
 assert.equal(matchesInsertionRanking(houseOnly,'third','no_suggestion'),true);
 assert.equal(matchesInsertionRanking(unresolved,'third','no_suggestion'),false);
 assert.equal(matchesInsertionRanking(unresolved,'third','unresolved'),true);
 assert.equal(matchesInsertionRanking(matched,'third','no_suggestion'),false);
 assert.equal(matchesInsertionRanking(thirdOnly,'third','third_only'),true);
 assert.equal(matchesDifferenceScope(matched),true);
 assert.equal(matchesDifferenceScope(houseOnly),false);
});

test('dimension values and group filters conserve membership',()=>{
 assert.equal(dimensionValue(houseOnly,'region','third'),'Region III');
 assert.equal(dimensionValue(houseOnly,'office','third'),'Bulacan 1st DEO');
 assert.equal(dimensionValue(thirdOnly,'office','third'),'No recorded office');
 const rows=filterGroupProjects([houseOnly,unresolved,matched,thirdOnly],{scope:'insertions',reading:'third',ranking:'no_suggestion',dim:'region',label:'Region III'});
 assert.deepEqual(rows.map(r=>r.id),['a']);
 const diffs=filterGroupProjects([houseOnly,matched],{scope:'differences',dim:'region',label:'NCR'});
 assert.deepEqual(diffs.map(r=>r.id),['c']);
});

test('compare deep links carry the nearest available filters',()=>{
 assert.deepEqual(compareHrefForGroup({scope:'insertions',ranking:'third_only',dim:'region',label:'Region VI'}),
  {view:'projects',region_match:'ignore',change:'third_only',region:'Region VI'});
 assert.equal(compareHrefForGroup({scope:'insertions',ranking:'no_suggestion',dim:'program',label:'Foreign-assisted projects'}).program,'fap');
 assert.equal(compareHrefForGroup({scope:'differences',dim:'pap',label:'BIP roads'}).q,'BIP roads');
});

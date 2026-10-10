import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesInsertionRanking,matchesDifferenceScope,matchesDeletionRanking,dimensionValue,filterGroupProjects,compareHrefForGroup} from './groupProjects.js';

const houseOnly={id:'a',title:'A',program:'Bridge Program',pap:'PAP-1',region:'Region III',trace:'house_only_candidate',
 reading_status:'same_amount',third:{amount_php:1e6,region:'Region III',office:'Bulacan 1st DEO',program:'Bridge Program',pap:'PAP-1'},nep:null,api:null};
const unresolved={...houseOnly,id:'b',title:'B',trace:'fuzzy_candidate',suggestions:[{confidence:0.9,nep:{id:'n'}}]};
const matched={id:'c',title:'C',program:'Local Program',pap:'PAP-2',region:'NCR',trace:'candidate_increase',reading_status:'same_amount',
 third:{amount_php:3e6,region:'NCR',office:'Central Office',program:'Local Program',pap:'PAP-2'},
 nep:{amount_php:1e6,region:'NCR',office:'Central Office'}};
const thirdOnly={id:'d',title:'D',program:'Local Program',region:'NCR',trace:'house_only_candidate',reading_status:'third_only',
 third:{amount_php:5e6,region:'NCR',office:'',program:'Local Program'},nep:null,api:null};
const nepSuggested={id:'n',title:'N',program:'Local Program',pap:'PAP-3',region:'NCR',trace:'nep_only_candidate',reading_status:'no_house_record',
 nep:{amount_php:2e6,region:'NCR',office:'Central Office',program:'Local Program',pap:'PAP-3'},api:null};
const nepAlone={...nepSuggested,id:'n2',nep:{amount_php:7e5,region:'Region III',office:'',program:'Local Program',pap:'PAP-3'}};

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
 const lasPinas={...houseOnly,id:'lp',third:{...houseOnly.third,
  office:'Las Pi ñ as-Muntinlupa District Engineering Office',
  office_canonical:'Las Piñas Muntinlupa District Engineering Office'}};
 assert.equal(dimensionValue(lasPinas,'office','third'),
  'Las Piñas Muntinlupa District Engineering Office');
 const rows=filterGroupProjects([houseOnly,unresolved,matched,thirdOnly],{scope:'insertions',reading:'third',ranking:'no_suggestion',dim:'region',label:'Region III'});
 assert.deepEqual(rows.map(r=>r.id),['a']);
 const diffs=filterGroupProjects([houseOnly,matched],{scope:'differences',dim:'region',label:'NCR'});
 assert.deepEqual(diffs.map(r=>r.id),['c']);
});

test('deletion ranking membership matches headlineStats rules and uses NEP assignments',()=>{
 const counterparts=new Map([['n',1]]);
 assert.equal(matchesDeletionRanking(nepSuggested,'suggested',counterparts),true);
 assert.equal(matchesDeletionRanking(nepSuggested,'no_suggestion',counterparts),false);
 assert.equal(matchesDeletionRanking(nepAlone,'no_suggestion',counterparts),true);
 assert.equal(matchesDeletionRanking(nepAlone,'suggested',counterparts),false);
 assert.equal(matchesDeletionRanking(houseOnly,'suggested',counterparts),false);
 assert.equal(matchesDeletionRanking(nepSuggested,'second_only',counterparts),false);
 // Deletion dimension values come from the NEP record, not a House reading.
 assert.equal(dimensionValue(nepAlone,'office','nep'),'No recorded office');
 assert.equal(dimensionValue(nepSuggested,'office','nep'),'Central Office');
 assert.equal(dimensionValue(nepSuggested,'region','nep'),'NCR');
 const rows=filterGroupProjects([houseOnly,nepSuggested,nepAlone],{scope:'deletions',ranking:'no_suggestion',dim:'region',label:'Region III'});
 assert.deepEqual(rows.map(r=>r.id),['n2']);
});

test('compare deep links carry the nearest available filters',()=>{
 assert.deepEqual(compareHrefForGroup({scope:'insertions',ranking:'third_only',dim:'region',label:'Region VI'}),
  {view:'projects',region_match:'ignore',change:'third_only',region:'Region VI'});
 assert.equal(compareHrefForGroup({scope:'insertions',ranking:'no_suggestion',dim:'program',label:'Foreign-assisted projects'}).program,'fap');
 assert.equal(compareHrefForGroup({scope:'differences',dim:'pap',label:'BIP roads'}).q,'BIP roads');
 assert.equal(compareHrefForGroup({scope:'deletions',ranking:'suggested'}).flag,'nep_only_suggested');
 assert.equal(compareHrefForGroup({scope:'deletions',ranking:'no_suggestion'}).flag,'nep_only');
 assert.equal(compareHrefForGroup({scope:'deletions',ranking:'second_only'}).change,'second_only');
 assert.equal(compareHrefForGroup({scope:'insertions',ranking:'no_suggestion'}).flag,'house_only');
});

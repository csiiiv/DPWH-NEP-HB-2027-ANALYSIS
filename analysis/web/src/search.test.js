import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesSearch} from './search.js';
test('short project descriptions match punctuation, reordered words and barangays',()=>{
 const title='Construction of Reinforced Concrete Box Culvert along J.P. Rizal St. (C 0+953 - C 1+471), Barangay 34 and 35, Caloocan City';
 assert.equal(matchesSearch(title,'J.P. Rizal box culvert, Barangays 34–35, Caloocan'),true);
 assert.equal(matchesSearch(title,'Rizal Caloocan culvert 35'),true);
 assert.equal(matchesSearch(title,'Rizal culvert Barangay 28'),false);
});

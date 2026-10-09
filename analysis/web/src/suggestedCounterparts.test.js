import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedCounterparts} from './suggestedCounterparts.js';
test('suggested counterpart labels count referring House rows without attaching or merging sources',()=>{
 const rows=[{id:'h1',suggestions:[{nep:{id:'n1'}},{nep:{id:'n1'}}]},{id:'h2',suggestions:[{nep:{id:'n1'}}]},{id:'n',nep:{id:'n1',amount_php:12}},{id:'other',nep:{id:'n2'}},{id:'already-paired',second:{amount_php:12},nep:{id:'n1'}}];
 const before=JSON.stringify(rows),result=suggestedCounterparts(rows);
 assert.deepEqual([...result],[['n',2]]);assert.equal(JSON.stringify(rows),before);
});

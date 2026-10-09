import test from 'node:test';
import assert from 'node:assert/strict';
import {regionName} from './regionNames.js';
test('region codes map to readable display names',()=>{
 assert.equal(regionName('Region III'),'Region III · Central Luzon');
 assert.equal(regionName('Region IV-A'),'Region IV-A · CALABARZON');
 assert.equal(regionName('NCR'),'NCR · National Capital Region');
 assert.equal(regionName('CAR'),'CAR · Cordillera Administrative Region');
 assert.equal(regionName('MIMAROPA'),'MIMAROPA · Southwestern Tagalog');
 assert.equal(regionName('Nationwide'),'Nationwide');
 // Unknown codes pass through unchanged rather than inventing names.
 assert.equal(regionName('Region XV'),'Region XV');
 assert.equal(regionName(''),'');
});

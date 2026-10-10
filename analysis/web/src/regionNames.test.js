import test from 'node:test';
import assert from 'node:assert/strict';
import {officeName,regionName} from './regionNames.js';
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
test('regional offices reuse the same place-name suffixes',()=>{
 assert.equal(officeName('Regional Office III'),'Regional Office III · Central Luzon');
 assert.equal(officeName('Regional Office IV-A'),'Regional Office IV-A · CALABARZON');
 assert.equal(officeName('NCR Regional Office'),'NCR Regional Office · National Capital Region');
 assert.equal(officeName('Regional Office MIMAROPA Region'),'Regional Office MIMAROPA Region · Southwestern Tagalog');
 // Non-regional offices and blanks stay as recorded.
 assert.equal(officeName('Central Office'),'Central Office');
 assert.equal(officeName('Quezon 4th District Engineering Office'),'Quezon 4th District Engineering Office');
 assert.equal(officeName(''),'');
});

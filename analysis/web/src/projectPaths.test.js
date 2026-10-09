import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hierarchyIndex,fullTreePath,projectSources,pathHref} from './projectPaths.js';
test('real HGAB3 record resolves every native ancestor and reading-specific deep links',()=>{
 const data=JSON.parse(readFileSync(new URL('../../data/hb_dpwh_native_ic_projects_3rd_reading.json',import.meta.url)));
 const path=fullTreePath(hierarchyIndex(data),'c5246');
 assert.equal(path[0].id,data.root.id);assert.equal(path.at(-1).id,'c5246');
 assert(path.some(n=>n.label.includes('Metro Manila 3rd District Engineering Office')));
 assert(path.some(n=>n.label.includes('National Capital Region')));
 assert(path.some(n=>n.label.includes('Flood Management')));
 const sources=projectSources({third:{native_node_id:'c5246'},second:null,nep:null,api:null});
 assert.equal(sources.length,1);
 assert.equal(pathHref(sources[0],path.at(-1)),'#house?view=projects&reading=third&node=c5246');
});
test('flat hierarchies retain ancestry and reject missing parents or cycles',()=>{
 const map=hierarchyIndex({nodes:[{id:'root',label:'Root',parent:null},{id:'office',label:'DEO',parent:'root'},{id:'project',label:'Road',parent:'office'}]});
 assert.deepEqual(fullTreePath(map,'project').map(n=>n.id),['root','office','project']);
 assert.throws(()=>fullTreePath(map,'unknown'),/missing/);
 map.get('office').parent='missing';assert.throws(()=>fullTreePath(map,'project'),/Missing source parent/);
 map.get('office').parent='project';assert.throws(()=>fullTreePath(map,'project'),/cycle/);
});

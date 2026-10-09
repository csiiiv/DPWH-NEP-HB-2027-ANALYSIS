import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {hydrateProjects} from './comparisonData.js';
import {unifiedComparison} from './unifiedComparison.js';
test('compact browser payload preserves source totals, identities, assignments and grouped members',()=>{
 const stages=JSON.parse(readFileSync(new URL('../../data/stage_trace_2027.json',import.meta.url)));
 const readings=JSON.parse(readFileSync(new URL('../../data/house_reading_changes_2027.json',import.meta.url)));
 const full=unifiedComparison(stages,readings),payload=comparisonPayloads(stages,readings),rows=hydrateProjects(payload.detail);
 for(let i=0;i<rows.length;i++)assert.deepEqual(rows[i].suggestions??[],full.projects[i].suggestions??[]);
 assert.deepEqual(payload.overview.paps,full.paps);assert.equal(rows.length,full.projects.length);
 for(let i=0;i<rows.length;i++)for(const side of ['second','third','nep','api']){
  const a=rows[i][side],b=full.projects[i][side];assert.equal(a?.id,b?.id);
  for(const key of ['amount_php','native_node_id','source_record_id','region','office','pdf_page','pdf_pages','title','program','pap','zone','evidence'])assert.deepEqual(a?.[key],b?.[key],`${rows[i].id} ${side} ${key}`);
  if(b?.records?.length>1)assert.equal(a.records.length,b.records.length);
 }
});

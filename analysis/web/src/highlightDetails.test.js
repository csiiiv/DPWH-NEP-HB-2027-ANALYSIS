import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headlineStats} from './headlineStats.js';
import {unifiedComparison} from './unifiedComparison.js';
import {regionCandidates} from './regionCandidates.js';
import {highlightDetails,hydrateHighlightDetails,HIGHLIGHT_IDS,allocationBreakdown,sourceAllocations} from './highlightDetails.js';

test('custom highlight evidence preserves full allocation membership, controls and source references',()=>{
 const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
 const stages=read('stage_trace_2027'),readings=read('house_reading_changes_2027'),roadGroups=read('road_group_candidates_2027'),chainage=read('chainage_units_2027');
 const unified=unifiedComparison(stages,readings),headlines=headlineStats(unified.projects);
 const data=hydrateHighlightDetails(highlightDetails({rows:unified.projects,headlines,paps:unified.paps,stages,readings,roadGroups,chainage}));
 assert.deepEqual(Object.keys(data.stories),HIGHLIGHT_IDS);
 assert.ok(!data.stories['transparency-gaps']);
 const selected=id=>data.stories[id].record_ids.map(i=>data.records[i]);
 const sum=(rows,side)=>sourceAllocations(rows,side).reduce((sum,r)=>sum+r.amount_php,0);
 assert.equal(sum(selected('funding-shift'),'nep'),headlines.sources.nep.programs['Foreign-assisted projects'].amount_php);
 assert.equal(sum(selected('funding-shift'),'third'),readings.summary.third.foreign_assisted_projects);
 const buildings=unified.paps.find(p=>p.label.startsWith('BIP - Multi-Purpose'));
 assert.equal(sum(selected('multi-purpose'),'third'),buildings.third_php);
 assert.equal(sum(selected('multi-purpose'),'nep'),buildings.nep_php);
 assert.equal(selected('caloocan').length,readings.summary.status_counts.third_only);
 assert.equal(sum(selected('caloocan'),'third'),readings.summary.allocation_delta_php);
 const inserted=selected('house-only');
 assert.ok(inserted.every(r=>r.third&&!r.nep));
 assert.equal(sum(inserted,'third'),headlines.rankings.third.no_suggestion.amount_php+headlines.rankings.third.unresolved.amount_php);
 const controls=data.stories['funding-shift'].controls;
 for(const side of ['nep','second','third'])assert.equal(controls[0][side+'_php'],controls[1][side+'_php']+controls[2][side+'_php']);
 const programRows=data.stories['funding-shift'].programs;
 for(const side of ['nep','second','third'])assert.equal(programRows.reduce((sum,p)=>sum+p[side+'_php'],0),headlines.sources[side].amount_php);
 const floodRows=data.stories['flood-priorities'].paps;
 const fapFlood=sum(selected('flood-priorities').filter(r=>r.zone==='fap'),'third');
 assert.equal(floodRows.find(p=>p.id==='flood-fap').third_php,fapFlood);
 assert.equal(floodRows.reduce((sum,p)=>sum+p.third_php,0),sum(selected('flood-priorities'),'third'));
 const groups=data.stories.groupings.groups;
 assert.equal(groups.reduce((sum,g)=>sum+g.leftover_amount_php,0),roadGroups.summary.leftover_amount_php);
 assert.equal(groups.reduce((sum,g)=>sum+g.leftover_house_rows,0),roadGroups.summary.leftover_house_rows);
 assert.ok(groups.every(g=>g.members.filter(m=>m.store==='house_rows').every(m=>m.comparison_id)));
 const deo=data.stories['office-capacity'].offices;
 for(const side of ['nep','third'])assert.equal(deo.reduce((sum,g)=>sum+g[side+'_php'],0),headlines.sources[side].offices['District engineering offices (DEOs)'].amount_php);
 for(const region of data.stories['regional-gains'].regions){
  const paps=data.stories['regional-gains'].regional_paps[region.label];
  for(const side of ['nep','third'])assert.equal(paps.reduce((sum,p)=>sum+p[side+'_php'],0),region[side+'_php']);
 }
 const shorter=data.stories['shorter-works'].rows;
 assert.ok(shorter.length>0);
 for(const row of shorter){assert.ok(row.house_length_m<row.nep_length_m);assert.ok(row.house_per_km>row.nep_per_km);assert.ok(row.nep_page&&row.house_page);}
 const example=shorter.find(r=>r.title.includes('Panitan'));
 assert.equal(example.amount_php,50000000);assert.equal(example.nep_length_m,477);assert.equal(example.house_length_m,132);
 const rainwater=data.stories.rainwater;
 assert.equal(rainwater.controls[0].delta_php,0);
 for(const side of ['nep','second','third']){
  assert.equal(sum(selected('rainwater'),side),1027200000);
  assert.equal(rainwater.bands.reduce((sum,band)=>sum+band[side+'_records'],0),217);
  assert.equal(rainwater.bands.reduce((sum,band)=>sum+band[side+'_php'],0),1027200000);
 }
 assert.equal(rainwater.regions.reduce((sum,region)=>sum+region.third_php,0),1027200000);
 const original=new Map(regionCandidates(unified.projects).map(row=>[row.id,row]));
 const preserved=['id','title','amount_php','region','office','program','pap','zone','pdf_page','pdf_pages','evidence'];
 function verifySource(actual,expected){
  if(!expected){assert.equal(actual,null);return;}
  for(const key of preserved)assert.deepEqual(actual[key],expected[key],`${expected.id}: ${key}`);
  assert.equal(actual.records?.length,expected.records?.length);
  expected.records?.forEach((member,i)=>verifySource(actual.records[i],member));
 }
 for(const row of data.records)for(const side of ['nep','third'])verifySource(row[side],original.get(row.id)[side]);
});

test('source rollups count group members once and exclude FAP by funding zone',()=>{
 const group={amount_php:30,region:'Region I',zone:'local',records:[{amount_php:10,region:'Region I',zone:'local'},{amount_php:20,region:'Region I',zone:'local'}]};
 const rows=[{third:group},{nep:{amount_php:100,region:'NCR',zone:'fap'}},{nep:{amount_php:7,region:'Region I',zone:'local'}}];
 const groups=allocationBreakdown(rows,'region',{nonFap:true});
 assert.equal(groups.length,1);assert.equal(groups[0].third_records,2);assert.equal(groups[0].third_php,30);assert.equal(groups[0].delta_php,23);
});

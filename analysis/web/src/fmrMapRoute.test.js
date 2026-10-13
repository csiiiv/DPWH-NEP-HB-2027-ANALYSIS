import test from 'node:test';
import assert from 'node:assert/strict';
import {readMapState,patchMapParams,mapObjectsParam} from './fmrMapRoute.js';
import {DEFAULT_MAP_OBJECTS} from './fmrMapModel.js';
test('shareable map state round-trips filters, focused IDs, thresholds, objects and basemap',()=>{
 const params=patchMapParams(new URLSearchParams('project=ib%3Ap689%3Ar18&rf_short_m=200'),{q:'road & bridge',region:'I',coordBasis:'normalized',review_flag:'missing',basemap:'dark',objects:mapObjectsParam({...DEFAULT_MAP_OBJECTS,red_flag:false})});
 const state=readMapState(new URLSearchParams(params.toString()));
 assert.equal(state.filters.q,'road & bridge');assert.equal(state.filters.project,'ib:p689:r18');assert.equal(state.filters.rf_short_m,'200');assert.equal(state.filters.coordBasis,'normalized');assert.equal(state.style,'dark');assert.equal(state.objects.red_flag,false);assert.equal(state.objects.coordinate_review,true);
});
test('all and zero objects restore distinctly and default values keep links short',()=>{
 assert.equal(mapObjectsParam(DEFAULT_MAP_OBJECTS),null);
 const none=Object.fromEntries(Object.keys(DEFAULT_MAP_OBJECTS).map(k=>[k,false]));
 assert.equal(mapObjectsParam(none),'none');assert.deepEqual(readMapState(new URLSearchParams('objects=none')).objects,none);
 assert.deepEqual(readMapState().objects,DEFAULT_MAP_OBJECTS);
 assert.equal(patchMapParams(new URLSearchParams('q=x&basemap=dark&coordBasis=normalized'),{q:'',basemap:'light',coordBasis:'reviewed'}).toString(),'');
});
test('unknown objects and invalid display settings are bounded',()=>{
 const state=readMapState(new URLSearchParams('objects=red_flag,unknown&basemap=invalid&coordBasis=invalid'));
 assert.equal(state.objects.red_flag,true);assert.equal(Object.values(state.objects).filter(Boolean).length,1);assert.equal(state.style,'light');assert.equal(state.filters.coordBasis,'reviewed');
});

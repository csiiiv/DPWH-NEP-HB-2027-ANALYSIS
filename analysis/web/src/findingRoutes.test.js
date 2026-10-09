import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonState,comparisonParams,boundedInteger,mergeFindingParams} from './findingRoutes.js';
import {routeHref,readRoute} from './routes.js';
test('comparison findings round trip Unicode searches, scoped offices, sorting and pagination',()=>{
 const state={tab:'projects',query:'J.P. Rizal — Barangays 34–35 & drainage',program:'Flood Management',region:'National Capital Region',office:'NCR|Metro Manila 3rd District Engineering Office',trace:'',readingStatus:'third_only',column:'1',mode:'delta',direction:-1,page:3,record:'house-reading:2',pathSource:'third'};
 const route=readRoute(routeHref('compare',comparisonParams(state)));
 assert.deepEqual(comparisonState(route.params),state);
});
test('reading defaults, explicit all status, malformed paging and unsupported sorting are distinct',()=>{
 assert.equal(comparisonState(new URLSearchParams('view=readings')).readingStatus,'reading_changed');
 assert.equal(comparisonState(new URLSearchParams('view=readings&sort=1')).column,'3');
 assert.equal(comparisonState(new URLSearchParams('view=readings&status=all')).readingStatus,'');
 const bad=comparisonState(new URLSearchParams('view=unknown&page=-9&sort=script&order=oops&metric=unknown'));
 assert.equal(bad.tab,'paps');assert.equal(bad.page,0);assert.equal(bad.column,'title');assert.equal(bad.mode,'total');assert.equal(bad.direction,1);
 assert.equal(boundedInteger('Infinity',150,150,10000),150);
});
test('source state preserves reading and volume while clearing previous filters',()=>{
 const result=mergeFindingParams(new URLSearchParams('reading=second&view=projects&q=old&node=c1'),{q:'Caloocan',filter:'projects',node:null});
 assert.deepEqual(result,{reading:'second',view:'projects',q:'Caloocan',filter:'projects'});
});

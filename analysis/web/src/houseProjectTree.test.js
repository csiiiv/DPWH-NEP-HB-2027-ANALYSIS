import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {houseProjectTree} from './houseProjectTree.js';
import {treeSourceReference} from './data.js';
import {matchesSearch} from './search.js';
test('real third-reading project is searchable and opens its I-C PDF, with separate additive total',()=>{
 globalThis.window={location:{href:'https://example.test/project/app/#house'}};
 const data=JSON.parse(readFileSync(new URL('../../data/hb_dpwh_native_ic_projects_3rd_reading.json',import.meta.url)));
 const tree=houseProjectTree(data,'third');
 assert.equal(tree.audit.total,639179718000);
 assert.equal(tree.nodes.find(n=>n.id===tree.root).printed,null);
 assert.equal(treeSourceReference('house',tree.nodes.find(n=>n.id===tree.root)),null);
 const hits=tree.nodes.filter(n=>matchesSearch(n.label,'J.P. Rizal box culvert, Barangays 34–35, Caloocan'));
 assert.equal(hits.length,1);
 assert.equal(hits[0].amount,32000000);
 const source=treeSourceReference('house',hits[0]);
 assert.equal(source.page,323);
 assert.match(source.url,/HB_BUDGET_3rd_reading\/.*I-C%20\.pdf$/);
 const map=new Map(tree.nodes.map(n=>[n.id,n]));
 let n=hits[0];const path=[];
 while(n){path.push(n.label);n=map.get(n.parent);}
 assert(path.some(x=>x.includes('Metro Manila 3rd District Engineering Office')));
 assert(path.some(x=>x.includes('National Capital Region')));
});
test('native tree rejects a modified amount even when cached audit says it passed',()=>{
 const leaf={id:'leaf',label:'Road',kind:'project',children:[],source:{pdf_page:10},printed_amount_php:10,recursive_leaf_sum_php:11,difference_php:0};
 assert.throws(()=>houseProjectTree({root:leaf}),/does not balance/);
});

test('third-reading controls retain PS and reference third-reading I-B',()=>{
 globalThis.window={location:{href:'https://example.test/project/app/#house'}};
 const data=JSON.parse(readFileSync(new URL('../../data/hb_dpwh_native_rollup_3rd_reading.json',import.meta.url)));
 const tree=houseProjectTree(data,'third','I-B');
 assert.equal(tree.audit.total,654102015000);
 assert.equal(tree.native_ic,false);
 assert.equal(tree.expense_breakdown.reduce((sum,c)=>sum+c.amount_php,0),tree.audit.total);
 const root=tree.nodes.find(n=>n.id===tree.root);
 assert.equal(root.columns_php.ps,14922297000);
 const source=treeSourceReference('house',root);
 assert.equal(source.page,9);
 assert.match(source.url,/HB_BUDGET_3rd_reading\/.*I-B\.pdf$/);
});

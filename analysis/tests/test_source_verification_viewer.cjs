/* Viewer regression: retained source amounts, review scopes and navigation. */
'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const test=require('node:test'), assert=require('node:assert/strict');
const viewers=path.join(__dirname,'../viewers');
function viewer(name) {
  const html=fs.readFileSync(path.join(viewers,name),'utf8');
  const payload=JSON.parse(html.match(/<script id="sourceData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const elements=new Map(),handlers={};
  function el(id) {
    if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:id==='filter'?'all':'',hidden:false,listeners:{},
      addEventListener(type,fn){this.listeners[type]=fn;},querySelector(){return null;}});
    return elements.get(id);
  }
  el('sourceData').textContent=JSON.stringify(payload);
  const document={getElementById:el,addEventListener(type,fn){handlers[type]=fn;},createElement(){return {};},head:{append(){}}};
  const sandbox={document,console};sandbox.window=sandbox;sandbox.SITE_CONFIG={hosted:true,reportBase:'https://example.invalid/docs/'};
  vm.runInContext(fs.readFileSync(path.join(viewers,'source_verification.js'),'utf8'),vm.createContext(sandbox));
  return {payload,el,handlers};
}
function click(v,dataset){v.handlers.click({target:{closest(){return {dataset};}}});}
function matching(v,count){assert.match(v.el('searchStatus').textContent,new RegExp(`${count.toLocaleString('en-US')} matching nodes`));}

test('native House source renders parent details, page reference and zero final balance',()=>{
  const v=viewer('hb_native_verification.html');
  assert.match(v.el('cards').innerHTML,/₱654\.102B/);
  assert.match(v.el('tree').innerHTML,/#page=9/);
  assert.match(v.el('tree').innerHTML,/PDF page 9<\/a>/);
  assert.match(v.el('details').innerHTML,/₱654,102,015,000/);
  assert.match(v.el('details').innerHTML,/Final remaining amount: <strong>₱0/);
});

test('NEP evidence review includes all reassessed flags and unchecked nodes',()=>{
  const v=viewer('nep_source_verification.html');
  assert.match(v.el('tree').innerHTML,/PDF page 8<\/a>/);
  v.el('search').value='p115:r0';v.el('search').listeners.input();
  assert.match(v.el('tree').innerHTML,/PDF page 115<\/span>/);
  v.el('search').value='';v.el('search').listeners.input();
  v.el('filter').value='review';v.el('filter').listeners.change();matching(v,v.payload.review_summary.needs_source_check+2);
  v.el('filter').value='mismatch';v.el('filter').listeners.change();matching(v,0);
});

test('Transparency NEP projects preserve codes, amounts and snapshot references',()=>{
  const v=viewer('dpwh_nep_api_verification.html');
  assert.match(v.el('cards').innerHTML,/11,372/);assert.match(v.el('cards').innerHTML,/₱445\.378B/);
  assert.doesNotMatch(v.el('tree').innerHTML,/PDF page|class="source-reference"/);
  const project=v.payload.nodes.find(n=>n.kind==='project');click(v,{select:project.id});
  assert.match(v.el('details').innerHTML,/2027DPWH-Proposal-00001/);
  assert.match(v.el('details').innerHTML,/₱33,000,000/);
  assert.match(v.el('details').innerHTML,/combined snapshot row 0/);
  assert.match(v.el('downloads').innerHTML,/href="fy2027-combined\.json"/);
});

test('review queue separates actionable checks and derived context with source images',()=>{
  const v=viewer('nep_source_verification.html');v.el('startReview').listeners.click();
  assert.equal(v.el('mode').value,'queue');matching(v,v.payload.review_summary.needs_source_check);
  assert.match(v.el('details').innerHTML,/Raw PDF text/);
  assert.match(v.el('details').innerHTML,/source_review_evidence\/p/);
  assert.match(v.el('details').innerHTML,/Next flag/);
  for(const [kind,count] of Object.entries(v.payload.review_summary.types)) {
    v.el('filter').value=kind;v.el('filter').listeners.change();matching(v,count);
  }
  const derived=v.payload.nodes.find(n=>n.review_kind==='derived_context');click(v,{select:derived.id});
  assert.match(v.el('details').innerHTML,/context, not an amount error/);
  click(v,{reviewBranch:'root'});matching(v,v.payload.review_summary.needs_source_check);
  assert.equal(v.el('clearReviewBranch').hidden,false);
});

test('expenditure classes reconcile and PS allocation remains distinct from row total',()=>{
  const v=viewer('nep_source_verification.html'),classes=v.payload.expense_breakdown;
  v.el('search').value='ps:p13:r4';v.el('search').listeners.input();click(v,{select:'ps:p13:r4'});
  assert.match(v.el('tree').innerHTML,/PS allocation in this branch/);
  for(const value of ['₱78,157,000','₱24,732,000','₱102,889,000'])assert.ok(v.el('details').innerHTML.includes(value));
  assert.match(v.el('details').innerHTML,/full printed row total is shown as context/);
  assert.equal(classes.reduce((s,c)=>s+c.amount_php,0),v.payload.audit.total);
  assert.match(v.el('expenseBreakdown').innerHTML,/Total = PS \+ MOOE \+ CO/);
  assert.equal(v.el('expenseScopeControl').hidden,false);
  const ps=classes.find(c=>c.key==='ps');v.el('expenseScope').value=ps.node_id;v.el('expenseScope').listeners.change();
  assert.match(v.el('details').innerHTML,/₱14,922,297,000/);
  assert.doesNotMatch(v.el('tree').innerHTML,/data-node="p115:r0"|data-node="p144:r0"/);
  v.el('search').value='p144:r0';v.el('search').listeners.input();matching(v,0);
  v.el('startReview').listeners.click();
  const ids=new Map(v.payload.nodes.map(n=>[n.id,n]));
  const belongs=n=>{while(n){if(n.id===ps.node_id)return true;n=ids.get(n.parent);}return false;};
  matching(v,v.payload.nodes.filter(n=>n.review_actionable&&belongs(n)).length);
  const hb=viewer('hb_native_verification.html');
  assert.equal(hb.payload.expense_breakdown.reduce((s,c)=>s+c.amount_php,0),hb.payload.audit.total);
  assert.equal(hb.el('expenseScopeControl').hidden,true);
  const api=viewer('dpwh_nep_api_verification.html');assert.equal(api.payload.expense_breakdown,null);
  assert.match(api.el('expenseBreakdown').innerHTML,/breakdown is unavailable/);
});

test('path navigation reveals target and clears filters and incompatible expense scope',()=>{
  const v=viewer('nep_source_verification.html');
  v.el('expenseScope').value='ps';v.el('expenseScope').listeners.change();v.el('startReview').listeners.click();
  v.el('search').value='unrelated query';click(v,{navigate:'p494:r27'});
  assert.equal(v.el('mode').value,'tree');assert.equal(v.el('expenseScope').value,'all');
  assert.equal(v.el('filter').value,'all');assert.equal(v.el('search').value,'');
  assert.ok(v.el('tree').innerHTML.includes('data-node="p494:r27"'));
  assert.match(v.el('details').innerHTML,/data-navigate="p494:r27" aria-current="location"/);
  const api=viewer('dpwh_nep_api_verification.html'),project=api.payload.nodes.find(n=>n.kind==='project');
  click(api,{navigate:project.id});assert.ok(api.el('tree').innerHTML.includes(`data-node="${project.id}"`));
  assert.ok(api.el('details').innerHTML.includes(`data-navigate="${project.parent}"`));
});

test('review categories, exact amounts, mobile panel state and reset preserve source data',()=>{
  const v=viewer('nep_source_verification.html');
  assert.match(v.el('reviewChips').innerHTML,/data-review-kind="row_identity"/);
  click(v,{reviewKind:'row_identity'});
  assert.equal(v.el('mode').value,'queue');assert.equal(v.el('filter').value,'row_identity');
  matching(v,v.payload.review_summary.types.row_identity);
  const target=v.payload.nodes.find(n=>n.review_kind==='row_identity');
  click(v,{select:target.id});assert.equal(v.el('workspace').className,'workspace evidence-active');
  v.el('treeView').listeners.click();assert.equal(v.el('workspace').className,'workspace tree-active');
  v.el('evidenceView').listeners.click();assert.equal(v.el('evidenceView').ariaPressed,'true');
  v.el('resetView').listeners.click();assert.equal(v.el('mode').value,'tree');assert.equal(v.el('filter').value,'all');
  assert.equal(v.el('search').value,'');assert.equal(v.el('workspace').className,'workspace tree-active');
  v.el('exactAmounts').checked=true;v.el('exactAmounts').listeners.change();
  assert.match(v.el('tree').innerHTML,/₱642,612,015,000/);
  assert.equal(v.payload.audit.total,642612015000);
});

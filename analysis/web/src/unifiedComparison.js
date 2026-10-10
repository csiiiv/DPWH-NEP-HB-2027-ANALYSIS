// Attach readings by retained native record IDs, never by fuzzy titles or row order.
export function unifiedComparison(stages, readings) {
  const stageByHouse=new Map();
  stages.projects.forEach((row,index)=>{
    if(row.house){if(stageByHouse.has(row.house.id))throw new Error('Duplicate HGAB2 source record');stageByHouse.set(row.house.id,{row,index});}
  });
  const consumed=new Set(), projects=[];
  for(const pair of readings.projects){
    const anchors=(pair.second?.records || (pair.second ? [pair.second] : [])).map(record=>{
      const anchor=stageByHouse.get(record.source_record_id);
      if(!anchor || anchor.row.house.amount_php !== record.amount_php || consumed.has(anchor.index))throw new Error('Missing or reused HGAB2 anchor');
      consumed.add(anchor.index);return anchor.row;
    });
    // Repeated House keys are already grouped by the audited ledger. Do not
    // transfer an individual NEP/API candidate into an ambiguous grouping.
    if(anchors.length>1 && anchors.some(row=>row.nep || row.api))throw new Error('Repeated House key has individual cross-stage anchors');
    const {house,...anchor}=anchors[0] || {};
    projects.push({...anchor,id:pair.id,title:pair.title,program:pair.program,pap:pair.pap,region:pair.region,zone:pair.zone,
      second:pair.second,third:pair.third,reading_status:pair.trace,reading_delta_php:pair.delta_php,match_basis:pair.match_basis,
      trace:anchor.trace || 'house_only_candidate',nep:anchor.nep || null,api:anchor.api || null});
  }
  stages.projects.forEach((row,index)=>{
    if(row.house && !consumed.has(index))throw new Error('Unconsumed HGAB2 source record');
    if(!row.house)projects.push({...row,id:`stage:${index}`,second:null,third:null,reading_status:'no_house_record',reading_delta_php:null});
  });
  const controls=new Map(readings.paps.map(p=>[JSON.stringify([p.program,p.label]),p]));
  const used=new Set();
  const paps=stages.paps.map(row=>{
    const key=JSON.stringify([row.program,row.label]),p=controls.get(key);if(p)used.add(key);
    if(row.house_control_php != null && (!p || p.second_php !== row.house_control_php))throw new Error('HGAB2 PAP control mismatch');
    return {...row,second_php:p?.second_php ?? null,third_php:p?.third_php ?? null,
      second_pages:p?.second_pages || row.house_pages,third_pages:p?.third_pages || [],
      reading_delta_php:p?.delta_php ?? null,reading_status:!p?'no_house_record':p.delta_php?'amount_changed':'same_amount'};
  });
  if(used.size !== controls.size)throw new Error('Unmapped reading PAP control');
  for(const [side,key] of [['second','second'],['third','third']]){
    const expected=readings.summary[key].operations_including_projects;
    if(projects.reduce((s,r)=>s+(r[side]?.amount_php || 0),0)!==expected || paps.reduce((s,r)=>s+(r[`${side}_php`] || 0),0)!==expected)throw new Error('Unified House totals do not reconcile');
  }
  for(const side of ['nep','api'])if(projects.reduce((s,r)=>s+(r[side]?.amount_php || 0),0)!==stages.projects.reduce((s,r)=>s+(r[side]?.amount_php || 0),0))throw new Error('Cross-stage amounts changed during reading join');
  return {paps,projects};
}

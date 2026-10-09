// An optional display join. Retained matches and source assignments stay intact.
const normalized=value=>String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
function key(record) {
  return JSON.stringify([record.zone,record.program,record.zone==='fap' ? record.program : record.pap_id,normalized(record.title)]);
}
export function regionCandidates(rows) {
  const houses=new Map(),neps=new Map();
  const add=(map,k,row)=>map.set(k,[...(map.get(k)||[]),row]);
  // Count all anchors, including existing matches and grouped House records,
  // so duplicate identities cannot become unique just by hiding a matched row.
  for(const row of rows){
    const house=row.second || row.third;
    if(house)add(houses,key(house),row);
    if(row.nep)add(neps,key(row.nep),row);
  }
  const replacements=new Map(),consumed=new Set();
  for(const [k,hs] of houses){
    const ns=neps.get(k) || [];
    if(hs.length!==1 || ns.length!==1)continue;
    const h=hs[0],n=ns[0],house=h.second || h.third;
    if(h.nep || h.api || n.second || n.third || (house.records?.length ?? 1)!==1 || h.reading_status==='repeated_key')continue;
    if(house.region===n.nep.region)continue;
    replacements.set(h.id,{...h,nep:n.nep,api:n.api,
      trace:'region_difference_candidate',strict_trace:h.trace,
      house_match:'region_difference_candidate',api_presence:n.api_presence,
      confidence:null,house_minus_nep_php:house.amount_php-n.nep.amount_php,
      region_difference:{house:house.region,nep:n.nep.region},
      relaxed_match_basis:'Unique normalized title + program + PAP + zone; region ignored',
      reason:'Source regions differ. Optional candidate only; source assignments are unchanged.'});
    consumed.add(n.id);
  }
  return rows.filter(row=>!consumed.has(row.id)).map(row=>replacements.get(row.id)||row);
}

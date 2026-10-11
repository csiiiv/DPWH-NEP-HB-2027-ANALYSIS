import {regionCandidates} from './regionCandidates.js';

const count = source => source?.records?.length ?? (source ? 1 : 0);
const bucket = () => ({comparison_rows:0,records:0,amount_php:0});

// Use the same candidate join as Analysis. Suggestions remain unpaired and
// never contribute extra source amounts. Change buckets form an accounting
// bridge, not a certification of insertions, removals or project identity.
export function highlightsData({rows,headlines,paps,stages,readings,roadGroups,chainage}) {
 const candidates=regionCandidates(rows);
 const changes=Object.fromEntries(['insertions','deletions','increased','decreased','unchanged'].map(key=>[key,bucket()]));
 let unresolved=0;
 for(const row of candidates){
  const house=row.third,nep=row.nep;
  let key,value,source;
  if(house&&!nep){key='insertions';value=house.amount_php;source=house;
   if(row.suggestions?.length || ['fuzzy_candidate','ambiguous'].includes(row.trace))unresolved++;
  }else if(nep&&!house){key='deletions';value=nep.amount_php;source=nep;
  }else if(nep&&house){
   const delta=house.amount_php-nep.amount_php;
   key=delta>0?'increased':delta<0?'decreased':'unchanged';value=Math.abs(delta);source=house;
  }else continue;
  const b=changes[key];b.comparison_rows++;b.records+=count(source);b.amount_php+=value;
 }
 const sources=Object.fromEntries(['nep','second','third'].map(side=>[side,{records:headlines.sources[side].records,amount_php:headlines.sources[side].amount_php}]));
 const net=changes.insertions.amount_php-changes.deletions.amount_php+changes.increased.amount_php-changes.decreased.amount_php;
 if(net!==sources.third.amount_php-sources.nep.amount_php)throw new Error('Highlights change bridge does not reconcile');
 if(changes.insertions.records+changes.increased.records+changes.decreased.records+changes.unchanged.records!==sources.third.records)throw new Error('Highlights House allocation counts do not reconcile');
 const regionTotals=new Map();
 for(const row of candidates)for(const [side,key] of [['nep','nep_php'],['third','house_php']]){
  const source=row[side];if(!source)continue;
  for(const member of source.records??[source]){
   const record={...source,...member},label=record.region??row.region??'No recorded region';
   const region=regionTotals.get(label)??{label,nep_php:0,house_php:0};
   if((record.zone??row.zone)!=='fap')region[key]+=record.amount_php;
   regionTotals.set(label,region);
  }
 }
 const regions=[...regionTotals.values()].map(region=>({...region,delta_php:region.house_php-region.nep_php})).sort((a,b)=>b.delta_php-a.delta_php);
 const units=new Map((chainage?.units??[]).map(unit=>[unit.id,unit]));
 const shorter=[];
 for(const row of candidates){
  if(row.house_match!=='chainage_candidate'||!row.second||!row.third||!row.nep||row.third.amount_php!==row.nep.amount_php)continue;
  const nep=units.get(`nep:${row.nep.id}`),house=units.get(`hb3:${row.third.native_node_id??row.third.id.split(':').at(-1)}`);
  if(!nep?.length_m||!house?.length_m||nep.length_review||house.length_review||house.length_m>=nep.length_m)continue;
  shorter.push({id:row.id,title:row.title,amount_php:house.amount_php,nep_length_m:nep.length_m,house_length_m:house.length_m,nep_page:row.nep.pdf_page,house_page:row.third.pdf_page});
 }
 const example=shorter.find(row=>row.title.includes('Panitan'))??shorter[0]??null;
 const grouping=roadGroups?.summary??stages.road_group_summary??null;
 const laoag=roadGroups?.groups?.find(group=>group.shell.includes('|laoag city|'));
 return {sources,changes,unresolved_insertions:unresolved,net_change_php:net,
  agency:{nep_php:stages.summary.stages.official_nep.new_appropriations_php,house_php:readings.summary.third.new_appropriations},
  paps,regions,offices:{nep:headlines.sources.nep.offices,third:headlines.sources.third.offices},
  grouping,laoag:laoag?{records:laoag.leftover_house_rows,amount_php:laoag.leftover_amount_php}:null,
  chainage:{shorter_same_amount:shorter.length,example},
  reading:{added:headlines.rankings.third.third_only,delta_php:readings.summary.allocation_delta_php},
  transparency:stages.summary.transparency_to_official,
  provenance:{built_at:stages.manifest?.built_at,reviewed_pairs:stages.summary.official_to_house.reviewed_pairs}};
}

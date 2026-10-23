import {regionCandidates} from './regionCandidates.js';
import {rainwaterSummary} from './rainwaterData.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';

const count = source => source?.records?.length ?? (source ? 1 : 0);
const bucket = () => ({comparison_rows:0,records:0,amount_php:0});
const ambiguous = row => row.suggestions?.length || ['fuzzy_candidate','ambiguous'].includes(row.trace);

// Use the same candidate join as Analysis. Only validated candidates —
// unpaired rows with no plausible counterpart — enter the four change
// columns. Ambiguous rows (fuzzy suggestions, possible re-titled
// replacements) are held out in `held` so the headline columns stay
// defensible; the full buckets still reconcile with the printed ledgers.
// Change buckets form an accounting bridge, not a certification of
// insertions, removals or project identity.
export function highlightsData({rows,headlines,paps,stages,readings,roadGroups,chainage}) {
 const candidates=regionCandidates(rows);
 const changes=Object.fromEntries(['insertions','deletions','increased','decreased','unchanged'].map(key=>[key,bucket()]));
 const held=Object.fromEntries(['insertions','deletions'].map(key=>[key,bucket()]));
 // Same-road pairs with disjoint station spans: attached for scope review,
 // reported separately, never booked as same-project changes.
 const scopeReview=bucket();
 scopeReview.nep_php=0;scopeReview.house_php=0;
 const counterparts=suggestedCounterparts(rows);
 for(const row of candidates){
  const house=row.third,nep=row.nep;
  let target,key,value,source;
  if(house&&!nep){key='insertions';value=house.amount_php;source=house;target=ambiguous(row)?held:changes;
  }else if(nep&&!house){key='deletions';value=nep.amount_php;source=nep;target=counterparts.has(row.id)?held:changes;
  }else if(nep&&house){
   // Segment-scope pairs (same road, disjoint station spans) are attached
   // for scope review: their delta is a different-segment artifact, so they
   // never enter the booked change columns. matchesFlag applies the same
   // exclusion, keeping Highlights and the Compare filters consistent.
   const segmentScope=row.house_match==='segment_scope_candidate'||
    (typeof row.trace==='string'&&row.trace.includes('segment_scope_review'));
   if(segmentScope){ // consumed by the scope bucket; nothing booked below
    scopeReview.comparison_rows++;scopeReview.records+=count(house);
    scopeReview.amount_php+=house.amount_php-nep.amount_php;
    scopeReview.nep_php+=nep.amount_php;scopeReview.house_php+=house.amount_php;
    continue;
   }
   const delta=house.amount_php-nep.amount_php;
   key=delta>0?'increased':delta<0?'decreased':'unchanged';value=Math.abs(delta);source=house;target=changes;
  }else continue;
  const b=target[key];b.comparison_rows++;b.records+=count(source);b.amount_php+=value;
 }
 const sources=Object.fromEntries(['nep','second','third'].map(side=>[side,{records:headlines.sources[side].records,amount_php:headlines.sources[side].amount_php}]));
 // Full candidate buckets (validated + held) reproduce the printed ledgers;
 // the four published columns are the validated subset only.
 const changes_full=Object.fromEntries(Object.entries(changes).map(([key,b])=>[key,{...b}]));
 for(const [key,b] of Object.entries(held)){changes_full[key].comparison_rows+=b.comparison_rows;changes_full[key].records+=b.records;changes_full[key].amount_php+=b.amount_php;}
 const net=changes_full.insertions.amount_php-changes_full.deletions.amount_php+changes_full.increased.amount_php-changes_full.decreased.amount_php+scopeReview.amount_php;
 if(net!==sources.third.amount_php-sources.nep.amount_php)throw new Error('Highlights change bridge does not reconcile');
 if(changes_full.insertions.records+changes_full.increased.records+changes_full.decreased.records+changes_full.unchanged.records+scopeReview.records!==sources.third.records)throw new Error('Highlights House allocation counts do not reconcile');
 const validated_net_php=changes.insertions.amount_php-changes.deletions.amount_php+changes.increased.amount_php-changes.decreased.amount_php;
 // Ambiguity splits use the same classification as the Analysis rankings:
 // House-only rows with retained NEP suggestions, and NEP-only rows that
 // unmatched House rows name as possible re-titled counterparts. The four
 // change columns keep the full buckets so the bridge above still ties.
 const split=group=>({comparison_rows:group.comparison_rows,amount_php:group.amount_php});
 const insertion_split={
  no_suggestion:split(headlines.rankings.third.no_suggestion),
  unresolved:split(headlines.rankings.third.unresolved),
 };
 const deletion_split={
  no_suggestion:split(headlines.deletions.no_suggestion),
  suggested:split(headlines.deletions.suggested),
 };
 const traceability={
  rows:insertion_split.unresolved.comparison_rows+deletion_split.suggested.comparison_rows,
  amount_php:insertion_split.unresolved.amount_php+deletion_split.suggested.amount_php,
 };
 // Controls above the project layer: new appropriations minus operations
 // (GAS + Support-to-Operations). The change bridge never sees this layer.
 const nepStage=stages.summary.stages.official_nep;
 const controlsOf=s=>s&&s.new_appropriations!=null&&s.operations_including_projects!=null
  ?s.new_appropriations-s.operations_including_projects:null;
 const controls={
  nep_php:nepStage&&nepStage.operations_php!=null?nepStage.new_appropriations_php-nepStage.operations_php:null,
  second_php:controlsOf(readings.summary.second),
  third_php:controlsOf(readings.summary.third),
 };
 controls.delta_php=controls.nep_php!=null&&controls.third_php!=null?controls.third_php-controls.nep_php:null;
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
 return {sources,changes,changes_full,unresolved_insertions:held.insertions.comparison_rows,net_change_php:net,
  validated_net_php,held,scope_review:scopeReview,
  insertion_split,deletion_split,traceability,controls,
  agency:{nep_php:stages.summary.stages.official_nep.new_appropriations_php,house_php:readings.summary.third.new_appropriations},
  paps,regions,offices:{nep:headlines.sources.nep.offices,third:headlines.sources.third.offices},
  grouping,laoag:laoag?{records:laoag.leftover_house_rows,amount_php:laoag.leftover_amount_php}:null,
  chainage:{shorter_same_amount:shorter.length,example},
  rainwater:rainwaterSummary(candidates),
  reading:{added:headlines.rankings.third.third_only,delta_php:readings.summary.allocation_delta_php,
   agency_delta_php:readings.summary.third.new_appropriations-(readings.summary.second?.new_appropriations??readings.summary.third.new_appropriations)},
  transparency:stages.summary.transparency_to_official,
  provenance:{built_at:stages.manifest?.built_at,reviewed_pairs:stages.summary.official_to_house.reviewed_pairs}};
}

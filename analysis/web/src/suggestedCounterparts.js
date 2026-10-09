// Relationships are review suggestions, never source attachments or deduplication.
export function suggestedCounterparts(rows){
 const byNep=new Map();
 for(const row of rows)for(const suggestion of row.suggestions??[]){
  const id=suggestion.nep?.native_node_id||suggestion.nep?.id;
  if(!id)continue;
  if(!byNep.has(id))byNep.set(id,new Set());
  byNep.get(id).add(row.id);
 }
 return new Map(rows.filter(row=>row.nep && !row.second && !row.third && byNep.has(row.nep.native_node_id||row.nep.id)).map(row=>[row.id,byNep.get(row.nep.native_node_id||row.nep.id).size]));
}

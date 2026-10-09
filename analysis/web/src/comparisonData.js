export function hydrateProjects(payload){
 return payload.projects.map(row=>{
  const result={...row};
  for(const side of ['second','third','nep','api'])if(row[side]){
   const {inherit=[],...source}=row[side];
   result[side]={...Object.fromEntries(inherit.map(key=>[key,row[key]])),...source};
  }
  return result;
 });
}

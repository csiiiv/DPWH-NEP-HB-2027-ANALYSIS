import {useEffect,useState} from 'react';
import {comparisonState,comparisonParams,writeFindingRoute} from './findingRoutes.js';
export function useComparisonFinding(route) {
  const [stored,setStored]=useState(()=>({route,state:comparisonState(route.params)}));
  // Restore external navigation before committing an old state to the URL.
  if (stored.route !== route) setStored({route,state:comparisonState(route.params)});
  const state=stored.route === route ? stored.state : comparisonState(route.params);
  useEffect(()=>{writeFindingRoute('compare',comparisonParams(state));},[state]);
  const set=(key,value)=>setStored(previous=>({route:previous.route,state:{...previous.state,
    [key]:typeof value === 'function' ? value(previous.state[key]) : value,
    ...(['page','record','pathSource'].includes(key) ? {} : {page:0}),
    ...(key==='record' ? {pathSource:''} : key==='pathSource' ? {} : {record:'',pathSource:''})}}));
  return [state,set];
}

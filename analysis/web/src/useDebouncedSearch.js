import {useEffect,useState} from 'react';
export function useDebouncedSearch(value,onChange,route,tab,delay=250) {
  const [stored,setStored]=useState(()=>({value,draft:value,route,tab}));
  const reset=stored.value!==value || stored.route!==route || stored.tab!==tab;
  if(reset)setStored({value,draft:value,route,tab});
  const draft=reset ? value : stored.draft;
  useEffect(()=>{
    if(draft===value)return;
    const timer=setTimeout(()=>onChange(draft),delay);
    return ()=>clearTimeout(timer);
  },[draft,value,route,tab,delay]);
  return [draft,draft=>setStored({value,draft,route,tab})];
}

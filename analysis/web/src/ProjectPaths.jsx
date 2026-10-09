import React,{useEffect,useState} from 'react';
import CandidateDetails from './CandidateDetails.jsx';
import {projectSources,loadProjectPaths,pathHref} from './projectPaths.js';
export default function ProjectPaths({row,sourceKey,onSourceChange,onPreview}) {
  const sources=projectSources(row),source=sources.find(s=>s.key===sourceKey) || sources[0];
  const [result,setResult]=useState({loading:true,paths:[],error:''});
  useEffect(()=>{
    let live=true;setResult({loading:true,paths:[],error:''});
    if(!source){setResult({loading:false,paths:[],error:'No recorded source hierarchy.'});return;}
    loadProjectPaths(source).then(paths=>{if(live)setResult({loading:false,paths,error:''});})
      .catch(error=>{if(live)setResult({loading:false,paths:[],error:error.message});});
    return ()=>{live=false;};
  },[row,source?.key]);
  return <section className="project-paths" aria-label="Project tree paths">
    {row.suggestions?.length>0 && <CandidateDetails row={row} onPreview={onPreview} />}
    <h3>Full source-tree path</h3>
    <div className="view-tabs" aria-label="Project path sources">{sources.map(s=><button key={s.key} aria-pressed={s.key===source?.key} onClick={()=>onSourceChange(s.key)}>{s.label}</button>)}</div>
    {result.loading && <p role="status">Loading source hierarchy…</p>}
    {result.error && <p role="alert">{result.error}</p>}
    {result.paths.map((record,i)=><div key={record.id}>
      {result.paths.length>1 && <p>Grouped record {i+1} of {result.paths.length} · {record.id}</p>}
      <ol aria-label={`Full ${source.label} tree path${result.paths.length>1?` ${i+1}`:''}`}>{record.path.map(node=><li key={node.id}><a href={pathHref(source,node)}>{node.label}</a></li>)}</ol>
      <a href={record.href}>Open this entry in the source tree →</a>
    </div>)}
  </section>;
}

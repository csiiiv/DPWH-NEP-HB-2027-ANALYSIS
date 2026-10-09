import {loadData} from './data.js';
import {routeHref} from './routes.js';
const cache=new Map();
export function hierarchyIndex(data) {
  const nodes=new Map();
  if(data.root && typeof data.root === 'object') {
    function visit(node,parent=null){
      if(nodes.has(node.id))throw new Error('Duplicate hierarchy node');
      nodes.set(node.id,{...node,parent});node.children.forEach(child=>visit(child,node.id));
    }
    visit(data.root);
  } else data.nodes.forEach(node=>nodes.set(node.id,node));
  return nodes;
}
export function fullTreePath(nodes,id) {
  if(!nodes.has(id))throw new Error('Source record is missing from the retained hierarchy');
  const result=[],seen=new Set();let node=nodes.get(id);
  while(node){
    if(seen.has(node.id))throw new Error('Hierarchy parent cycle');
    seen.add(node.id);result.unshift({id:node.id,label:node.label});
    if(node.parent && !nodes.has(node.parent))throw new Error('Missing source parent');
    node=nodes.get(node.parent);
  }
  return result;
}
export function projectSources(row) {
  return [
    {key:'third',label:'HGAB3 · 3rd reading',row:row.third,file:'hb_dpwh_native_ic_projects_3rd_reading.json',route:'house',params:{view:'projects',reading:'third'}},
    {key:'second',label:'HGAB2 · 2nd reading',row:row.second,file:'hb_dpwh_native_ic_projects.json',route:'house',params:{view:'projects',reading:'second'}},
    {key:'nep',label:'DBM NEP',row:row.nep,file:'verification_nep.json',route:'nep',params:{}},
    {key:'api',label:'DPWH Transparency NEP',row:row.api,file:'verification_dpwh_nep_api.json',route:'transparency',params:{}},
  ].filter(source=>source.row);
}
export async function loadProjectPaths(source) {
  if(!cache.has(source.file))cache.set(source.file,loadData(source.file).then(hierarchyIndex).catch(error=>{cache.delete(source.file);throw error;}));
  const index=await cache.get(source.file);
  return (source.row.records || [source.row]).map(record=>{
    const id=record.native_node_id || record.id;
    return {id,path:fullTreePath(index,id),href:routeHref(source.route,{...source.params,node:id})};
  });
}
export const pathHref=(source,node)=>routeHref(source.route,{...source.params,node:node.id});

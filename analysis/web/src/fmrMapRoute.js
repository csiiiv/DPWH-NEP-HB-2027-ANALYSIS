import {DEFAULT_MAP_OBJECTS, MAP_OBJECT_OPTIONS} from './fmrMapModel.js';
export const MAP_FILTER_DEFAULTS = {
  q:'',region:'',status:'',coordinate:'',direction:'',method:'',coord_side:'',
  extraction:'',rule:'',review_flag:'',text_basis:'',coordBasis:'reviewed',
};
const extraFilters = ['project','pair','focus','rf_short_m','rf_long_km','rf_cost_multiple','rf_increase_pct'];
export function readMapState(params = new URLSearchParams()) {
  const filters = {...MAP_FILTER_DEFAULTS};
  for (const key of [...Object.keys(filters),...extraFilters]) if (params.has(key)) filters[key] = params.get(key);
  if (!['reviewed','normalized'].includes(filters.coordBasis)) filters.coordBasis = 'reviewed';
  const selected = params.has('objects') ? new Set(params.get('objects').split(',')) : null;
  return {filters,style:params.get('basemap') === 'dark' ? 'dark' : 'light',
    objects:Object.fromEntries(MAP_OBJECT_OPTIONS.map(([key]) => [key,selected ? selected.has(key) : DEFAULT_MAP_OBJECTS[key]]))};
}
export function patchMapParams(params, patch) {
  const next = new URLSearchParams(params);
  for (const [key,value] of Object.entries(patch)) {
    if (value == null || value === '' || value === MAP_FILTER_DEFAULTS[key] || (key === 'basemap' && value === 'light')) next.delete(key);
    else next.set(key,String(value));
  }
  return next;
}
export function mapObjectsParam(objects) {
  const selected = MAP_OBJECT_OPTIONS.filter(([key]) => objects[key]).map(([key]) => key);
  return selected.length === MAP_OBJECT_OPTIONS.length ? null : selected.length ? selected.join(',') : 'none';
}

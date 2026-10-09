import {routeHref} from './routes.js';
export function boundedInteger(value, fallback, min, max) {
  if (!/^\d+$/.test(String(value ?? ''))) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
export function comparisonState(params) {
  const tab = choice(params.get('view') || (params.get('section') === 'house-readings' ? 'readings' : ''), ['paps','projects','readings','gaps'], 'paps');
  return {tab, query:params.get('q') || '', program:params.get('program') || '', region:params.get('region') || '', office:params.get('office') || '',
    trace:params.get('status') === 'all' ? '' : params.get('status') || (tab === 'readings' ? 'reading_changed' : ''),
    column:choice(params.get('sort'), tab === 'gaps' ? ['title','amount','region','pdf_page'] : ['title','0','1',...(tab === 'readings' ? ['reading_delta'] : ['2'])], 'title'),
    mode:choice(params.get('metric'), ['total','delta','percent'], 'total'), direction:params.get('order') === 'desc' ? -1 : 1,
    page:boundedInteger(params.get('page'),1,1,100000)-1};
}
export function comparisonParams(state) {
  const p = {view:state.tab};
  for (const [key,value] of Object.entries({q:state.query,program:state.program,region:state.region,office:state.office})) if (value) p[key]=value;
  if (state.trace) p.status=state.trace;
  else if (state.tab === 'readings') p.status='all';
  if (state.column !== 'title') p.sort=state.column;
  if (state.mode !== 'total') p.metric=state.mode;
  if (state.direction === -1) p.order='desc';
  if (state.page) p.page=String(state.page+1);
  return p;
}
// Updating findings must not reload data or interrupt typing. Explicit route
// navigation still uses hashchange and the browser's existing history entries.
export function writeFindingRoute(key, params) {
  const href=routeHref(key,params);
  if (window.location.hash === href) return;
  window.history.replaceState(window.history.state,'',href);
  window.dispatchEvent(new Event('findingstatechange'));
}

export function mergeFindingParams(base, patch) {
  const params=new URLSearchParams(base);
  for (const [key,value] of Object.entries(patch)) {
    if (value == null || value === '' || value === false) params.delete(key);
    else params.set(key,String(value));
  }
  return Object.fromEntries(params);
}
export function restoreControl(element, value) {
  if (value == null || !element) return;
  if (element.type === 'checkbox') element.checked=value === '1';
  else if (element.tagName !== 'SELECT' || [...element.options].some(o=>o.value === value)) element.value=value;
}

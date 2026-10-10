import {routeHref} from './routes.js';
import {FLAG_OPTIONS, MATCH_STATUS_OPTIONS, parseLegacyStatus} from './matchFilters.js';
export function boundedInteger(value, fallback, min, max) {
  if (!/^\d+$/.test(String(value ?? ''))) return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
const MATCH_VALUES = MATCH_STATUS_OPTIONS.map(([v]) => v);
const FLAG_VALUES = FLAG_OPTIONS.map(([v]) => v);

// Presence filters that Analysis still emits as change=; map onto flag=.
const CHANGE_TO_FLAG = {
  house_records_only: 'house_only',
  nep_only_unresolved: 'nep_only',
  nep_only_suggested: 'nep_only_suggested',
  no_house_record: 'nep_only',
};

export function comparisonState(params) {
  const legacy = params.get('view') === 'readings' || params.get('section') === 'house-readings';
  const tab = legacy ? 'projects' : choice(params.get('view'), ['paps','projects','gaps'], 'paps');
  const oldSort=params.get('sort');
  const column=legacy && ['0','1'].includes(oldSort) ? String(Number(oldSort)+2) : oldSort;
  const rawStatus = legacy ? '' : params.get('status') === 'all' ? '' : params.get('status') || '';
  const parsed = parseLegacyStatus(rawStatus);
  const matchStatus = choice(params.get('match') || parsed.matchStatus, ['', ...MATCH_VALUES], '');
  const flag = choice(params.get('flag') || parsed.flag, ['', ...FLAG_VALUES], '');
  const rawChange = legacy ? (params.get('status') === 'all' ? '' : params.get('status') || 'reading_changed') : params.get('change') || '';
  let readingStatus = rawChange;
  let mappedFlag = flag;
  if (!legacy && CHANGE_TO_FLAG[rawChange]) {
    // Prefer flag= for presence; keep readingStatus empty so reading dropdown stays clean.
    mappedFlag = mappedFlag || CHANGE_TO_FLAG[rawChange];
    readingStatus = '';
  }
  return {tab, query:params.get('q') || '', program:params.get('program') || '', region:params.get('region') || '', office:params.get('office') || '',
    trace:parsed.trace,
    matchStatus,
    flag: mappedFlag,
    regionMatching:params.get('region_match') === 'ignore' ? 'ignore' : 'strict',
    readingStatus,
    column:choice(column, tab === 'gaps' ? ['title','amount','region','pdf_page'] : ['title','0','1','2','3','reading_delta'], 'title'),
    mode:choice(params.get('metric'), ['total','delta','percent'], 'total'), direction:params.get('order') === 'desc' ? -1 : 1,
    record:tab === 'projects' ? params.get('record') || '' : '', pathSource:choice(params.get('path_source'),['third','second','nep','api'],''),
    page:boundedInteger(params.get('page'),1,1,100000)-1};
}
export function comparisonParams(state) {
  const p = {view:state.tab};
  for (const [key,value] of Object.entries({q:state.query,program:state.program,region:state.region,office:state.office})) if (value) p[key]=value;
  if (state.regionMatching === 'ignore') p.region_match='ignore';
  if (state.matchStatus) p.match=state.matchStatus;
  if (state.flag) p.flag=state.flag;
  // Legacy exact-trace deep links (unmapped compound statuses).
  if (state.trace) p.status=state.trace;
  if (state.readingStatus) p.change=state.readingStatus;
  if (state.column !== 'title') p.sort=state.column;
  if (state.mode !== 'total') p.metric=state.mode;
  if (state.direction === -1) p.order='desc';
  if(state.tab==='projects' && state.record){p.record=state.record;if(state.pathSource)p.path_source=state.pathSource;}
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

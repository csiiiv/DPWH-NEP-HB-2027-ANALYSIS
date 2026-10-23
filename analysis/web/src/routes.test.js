import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes, legacyRoutes, readRoute, readWorkspace, routeHref, workspaceHref, fmrPages, workspaces, workspaceLabels, dpwhPages } from './routes.js';

test('all six historical viewers map to an existing SPA route', () => {
  assert.equal(Object.keys(legacyRoutes).length, 7);
  for (const key of Object.values(legacyRoutes)) assert.ok(routes[key]);
});
test('hash routes preserve review and entity parameters and accept slash links', () => {
  assert.equal(readRoute('').workspace, 'overview');
  assert.equal(readRoute('').key, 'home');
  const route = readRoute('#/nep?view=review&node=p195%3Ar4');
  assert.equal(route.key, 'nep');
  assert.equal(route.params.get('view'), 'review');
  assert.equal(route.params.get('node'), 'p195:r4');
  assert.equal(routeHref('nep', {node: 'p195:r4'}, 'dpwh'), '#nep?node=p195%3Ar4');
  assert.equal(readRoute('#missing').key, 'missing');
});

test('fmr workspace routes are prefixed and keep their query params', () => {
  assert.equal(readWorkspace('#fmr/home'), 'fmr');
  assert.equal(readWorkspace('#compare?view=projects'), 'dpwh');
  assert.equal(readWorkspace(''), 'overview');
  const route = readRoute('#fmr/nep?view=tree&node=nep_fmr%3Ap1%3Ar5');
  assert.equal(route.workspace, 'fmr');
  assert.equal(route.key, 'nep');
  assert.equal(route.params.get('node'), 'nep_fmr:p1:r5');
  assert.equal(readRoute('#fmr').key, 'home');
  assert.equal(readRoute('#fmr/').key, 'home');
  // Workspace keys never leak into DPWH route keys.
  assert.equal(readRoute('#nep').workspace, 'dpwh');
});
test('route hrefs stay inside the requested workspace', () => {
  assert.equal(routeHref('compare', {view: 'projects'}, 'fmr'), '#fmr/compare?view=projects');
  assert.equal(routeHref('home', {}, 'fmr'), '#fmr/home');
  assert.equal(routeHref('home', {}, 'dpwh'), '#home');
  assert.equal(routeHref('nep', {view: 'review'}, 'dpwh'), '#nep?view=review');
});
test('workspace switching keeps analogous tabs and falls back home', () => {
  assert.equal(workspaceHref('fmr', readRoute('#compare?view=projects')), '#fmr/compare');
  assert.equal(workspaceHref('dpwh', readRoute('#fmr/highlights?story=x')), '#highlights');
  // FMR has no transparency/resources/about tabs: fall back to home.
  assert.equal(workspaceHref('fmr', readRoute('#transparency')), '#fmr/home');
  assert.equal(workspaceHref('fmr', readRoute('#about')), '#fmr/home');
  // Shared FMR tabs exist in DPWH; Map is FMR-only and falls back to Home.
  for (const [key] of fmrPages) {
    if (key === 'map') assert.equal(workspaceHref('dpwh', readRoute(`#fmr/${key}`)), '#home');
    else assert.ok(routes[key]);
  }
});
test('hfep workspace routes are prefixed and stay out of DPWH route keys', () => {
  assert.equal(readWorkspace('#hfep/home'), 'hfep');
  const route = readRoute('#hfep/nep?view=tree&node=nep_hfep%3Ap1%3Ar5');
  assert.equal(route.workspace, 'hfep');
  assert.equal(route.key, 'nep');
  assert.equal(route.params.get('node'), 'nep_hfep:p1:r5');
  assert.equal(readRoute('#hfep').key, 'home');
  // The compare tab exists: cross-document comparison is offered with
  // reviewable pairs (the populations stay unmerged).
  assert.equal(readRoute('#hfep/compare?view=pairs').key, 'compare');
  assert.equal(workspaceHref('hfep', readRoute('#compare?view=projects')), '#hfep/compare');
  assert.equal(workspaceHref('fmr', readRoute('#hfep/analysis?view=stats')), '#fmr/analysis');
  assert.equal(routeHref('nep', {view: 'review'}, 'hfep'), '#hfep/nep?view=review');
});
test('unregistered hash prefixes fall back to the DPWH workspace', () => {
  // An unknown prefix (e.g. a future annex not yet registered) must not
  // crash routing or leak its prefix into DPWH route keys.
  assert.equal(readWorkspace('#unknown/tab'), 'dpwh');
  const route = readRoute('#unknown/nep?view=tree');
  assert.equal(route.workspace, 'dpwh');
  assert.equal(route.key, 'unknown/nep');
});
test('the workspace registry exposes consistent labels, prefixes and pages', () => {
  // Every workspace needs a label, at least one tab, and a unique prefix.
  assert.deepEqual(workspaceLabels, {overview: 'Overview', dpwh: 'DPWH', fmr: 'DA Farm-to-Market Roads', hfep: 'DOH Health Facilities', nia: 'NIA Irrigation', congress: 'Congress', geo: 'Geolocation', sources: 'Sources', about: 'About', disclaimer: 'Disclaimer', experiments: 'Experiments'});
  assert.deepEqual(Object.keys(workspaces), ['overview', 'dpwh', 'fmr', 'hfep', 'nia', 'congress', 'geo', 'sources', 'about', 'disclaimer', 'experiments']);
  const prefixes = Object.values(workspaces).map(ws => ws.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length, 'prefixes must be unique');
  for (const ws of Object.values(workspaces)) {
    assert.ok(ws.label);
    assert.ok(ws.pages.length >= 1);
    for (const [key] of ws.pages) assert.equal(typeof key, 'string');
  }
  // Hidden workspaces resolve in the router but never join listed nav.
  assert.equal(workspaces.experiments.hidden, true);
  assert.equal(workspaces.congress.hidden, true);
  assert.ok(!Object.keys(workspaces).filter(key => !workspaces[key].hidden).includes('congress'));
  assert.equal(readWorkspace('#congress/district?district=office-group:leg:tarlac:3rd'), 'congress');
  assert.equal(readWorkspace('#experiments'), 'experiments');
  assert.equal(readWorkspace('#experiments?chart=flow'), 'experiments');
  // DPWH keeps the empty prefix; annexes each own one hash segment.
  assert.equal(workspaces.dpwh.prefix, '');
  assert.ok(dpwhPages.length >= fmrPages.length);
});
test('Overview is the default landing page while historical workspace routes remain explicit', () => {
  for (const href of ['', '#', '#/', '#overview', '#overview?exact=1']) assert.equal(readWorkspace(href), 'overview');
  assert.equal(readRoute('#home').workspace, 'dpwh');
  assert.equal(readRoute('#overview?exact=1').params.get('exact'), '1');
  assert.equal(routeHref('home', {exact: '1'}, 'overview'), '#overview?exact=1');
  assert.equal(workspaceHref('overview', readRoute('#nia/analysis?view=insertions')), '#overview');
  assert.equal(workspaceHref('dpwh', readRoute('#overview')), '#home');
  assert.equal(workspaceHref('nia', readRoute('#overview')), '#nia/home');
  assert.equal(readRoute('#nia/analysis?view=overview').workspace, 'nia');
});
test('Sources catalogs datasets behind its own workspace prefix', () => {
  assert.equal(readWorkspace('#sources'), 'sources');
  assert.equal(readRoute('#sources').key, 'home');
  assert.equal(routeHref('home', {}, 'sources'), '#sources');
  assert.equal(workspaceHref('sources', readRoute('#compare?view=projects')), '#sources');
  assert.equal(workspaceHref('dpwh', readRoute('#sources')), '#home');
});
test('the former DPWH Resources and About routes resolve to shared workspaces', () => {
  // Resources folded into Sources; About is a top-level workspace.
  assert.equal(readWorkspace('#resources'), 'sources');
  assert.equal(readWorkspace('#about'), 'about');
  assert.equal(readRoute('#about').key, 'home');
  assert.equal(routeHref('home', {}, 'about'), '#about');
  assert.equal(workspaceHref('about', readRoute('#compare?view=projects')), '#about');
});
test('NIA deep links and analogous workspace switches preserve source selections', () => {
  const route = readRoute('#nia/house?node=ib%3Ap896%3Ar2');
  assert.equal(route.workspace, 'nia');
  assert.equal(route.key, 'house');
  assert.equal(route.params.get('node'), 'ib:p896:r2');
  assert.equal(readRoute('#nia').key, 'home');
  assert.equal(routeHref('compare', {view: 'projects'}, 'nia'), '#nia/compare?view=projects');
  assert.equal(workspaceHref('nia', readRoute('#fmr/house?node=x')), '#nia/house');
  assert.equal(workspaceHref('nia', readRoute('#fmr/map')), '#nia/home');
});

test('geo workspace routes stay prefixed and deep-link the map', () => {
  assert.equal(readWorkspace('#geo/home'), 'geo');
  assert.equal(readRoute('#geo').key, 'home');
  const route = readRoute('#geo/map?dataset=hgab_fmr&status=parsed_with_issues');
  assert.equal(route.workspace, 'geo');
  assert.equal(route.key, 'map');
  assert.equal(route.params.get('dataset'), 'hgab_fmr');
  assert.equal(routeHref('map', {dataset: 'hgab_fmr'}, 'geo'), '#geo/map?dataset=hgab_fmr');
  // Geolocation has only Home/Map: other tabs fall back to home.
  assert.equal(workspaceHref('geo', readRoute('#nia/analysis')), '#geo/home');
  assert.equal(workspaceHref('nia', readRoute('#geo/map')), '#nia/home');
});


test('congress workspace routes stay prefixed and deep-link a district', () => {
  assert.equal(readWorkspace('#congress/home'), 'congress');
  assert.equal(readWorkspace('#congress'), 'congress');
  assert.equal(readRoute('#congress').key, 'home');
  const route = readRoute('#congress/district?district=office-group:leg:tarlac:3rd&dataset=dpwh');
  assert.equal(route.workspace, 'congress');
  assert.equal(route.key, 'district');
  assert.equal(route.params.get('district'), 'office-group:leg:tarlac:3rd');
  assert.equal(route.params.get('dataset'), 'dpwh');
  assert.equal(routeHref('district', {district: 'office-group:leg:tarlac:3rd'}, 'congress'),
    '#congress/district?district=office-group%3Aleg%3Atarlac%3A3rd');
  // Congress has one tab (the grid); the district page is a deep link reached
  // by clicking a representative, so it must never appear in the tab strip.
  assert.deepEqual(workspaces.congress.pages, [['home', 'Districts']]);
  assert.equal(workspaceHref('congress', readRoute('#nia/analysis')), '#congress/home');
  assert.equal(workspaceHref('nia', readRoute('#congress/district')), '#nia/home');
  // A stale district id is dropped rather than read as the literal string
  // "null", so a bookmarked card that no longer exists returns to the list.
  assert.equal(readRoute('#congress/district?district=null').params.get('district'), null);
  // Empty and unset are treated the same way, and routeHref omits them.
  assert.equal(readRoute('#congress/district?district=').params.get('district'), '');
  assert.equal(routeHref('home', {district: null, dataset: ''}, 'congress'), '#congress/home');
});

test('tab resets omit cleared state instead of selecting a candidate named null', () => {
  for (const workspace of ['dpwh','fmr','nia','hfep']) {
    const href=routeHref('analysis',{view:'deletions',pair:null,status:null,group:null,sort:undefined,page:'',q:'canal',stage:'house'},workspace);
    const parsed=readRoute(href);
    assert.equal(parsed.params.get('pair'),null);assert.equal(parsed.params.get('status'),null);
    assert.equal(parsed.params.get('group'),null);assert.equal(parsed.params.get('sort'),null);
    assert.equal(parsed.params.get('page'),null);assert.equal(parsed.params.get('q'),'canal');
    assert.equal(parsed.params.get('stage'),'house');
  }
  assert.equal(routeHref('home',{page:0,flag:false},'nia'),'#nia/home?page=0&flag=false');
});
test('legacy null reset links recover without stripping literal search text',()=>{
  const route=readRoute('#nia/analysis?view=insertions&pair=null&status=null&group=undefined&q=null');
  assert.equal(route.params.get('pair'),null);assert.equal(route.params.get('status'),null);
  assert.equal(route.params.get('group'),null);assert.equal(route.params.get('q'),'null');
});

test('the disclaimer has a stable direct route from every workspace', () => {
  assert.equal(readWorkspace('#disclaimer'), 'disclaimer');
  assert.equal(readRoute('#disclaimer').key, 'home');
  assert.equal(routeHref('home', {}, 'disclaimer'), '#disclaimer');
  for (const workspace of Object.keys(workspaces)) {
    const route = readRoute(routeHref('home', {}, workspace));
    assert.equal(workspaceHref('disclaimer', route), '#disclaimer');
  }
});

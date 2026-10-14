// Render the Geolocation views through Vite's JSX loader, including deep links.
import React from 'react';
import {renderToString} from 'react-dom/server';
import fs from 'node:fs';
import {createServer} from 'vite';
const data = JSON.parse(fs.readFileSync(new URL('../../../gps-analysis/data/gps_workbench.json', import.meta.url), 'utf8'));
globalThis.window = {location: {href: 'http://localhost/', hash: ''}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({matches: false})};
globalThis.location = window.location;
const server = await createServer({root: new URL('..', import.meta.url).pathname, server: {middlewareMode: true}, appType: 'custom'});
try {
  const {default: GeoApp} = await server.ssrLoadModule('/src/GeoApp.jsx');
  const {default: GeoMap} = await server.ssrLoadModule('/src/GeoMap.jsx');
  const routes = ['#geo/home'];
  for (const hash of routes) {
    window.location.hash = hash;
    const html = renderToString(React.createElement(GeoApp, {initialData: data}));
    if (!html.includes('<h1>') || html.includes('Loading geolocation sources')) throw new Error(`View did not render: ${hash}`);
    console.log(`OK ${hash}`);
  }
  window.location.hash = '#geo/home';
  const html = renderToString(React.createElement(GeoApp, {initialData: data}));
  for (const expect of ['Geolocated budget records', 'FMR road annexes', 'Interpretation rules applied', 'DPWH records with GPS by PAP']) {
    if (!html.includes(expect)) throw new Error(`Home view missing: ${expect}`);
  }
  console.log('OK home content probes');
  // The map view lazy-loads in the app shell; render it directly with route state.
  for (const query of ['', 'dataset=hgab_fmr', 'group=dpwh&status=parsed_with_issues', 'kind=dms_pair',
    'rule=longitude_first_reordered', 'issue=outside_philippines_orientation_bounds', 'basemap=dark',
    `pap=${encodeURIComponent('BIP - Multi-Purpose Buildings/ Facilities to support Social Services')}`]) {
    window.location.hash = `#geo/map${query ? '?' + query : ''}`;
    const {readRoute} = await server.ssrLoadModule('/src/routes.js');
    const mapHtml = renderToString(React.createElement(GeoMap, {data, route: readRoute()}));
    for (const expect of ['GPS-bearing budget records', 'Basemap']) {
      if (!mapHtml.includes(expect)) throw new Error(`Map view missing ${expect}: ${query}`);
    }
    console.log(`OK #geo/map${query ? '?' + query : ''}`);
  }
} finally {await server.close();}

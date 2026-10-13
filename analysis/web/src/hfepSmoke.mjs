// Render the HFEP loaded views through Vite's JSX loader, including deep links.
import React from 'react';
import {renderToString} from 'react-dom/server';
import fs from 'node:fs';
import {createServer} from 'vite';
const data = JSON.parse(fs.readFileSync(new URL('../../../other-analysis/data/hfep_workbench.json', import.meta.url), 'utf8'));
globalThis.window = {location: {href: 'http://localhost/', hash: ''}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({matches: false})};
globalThis.location = window.location;
const server = await createServer({root: new URL('..', import.meta.url).pathname, server: {middlewareMode: true}, appType: 'custom'});
try {
  const {default: HfepApp} = await server.ssrLoadModule('/src/HfepApp.jsx');
  const routes = ['#hfep/home', '#hfep/highlights',
    '#hfep/highlights?story=nep-defect', '#hfep/highlights?story=agency-check', '#hfep/highlights?story=ocr-flags', '#hfep/highlights?story=missing',
    '#hfep/compare', '#hfep/compare?view=pairs', '#hfep/compare?view=pairs&changed=changed', '#hfep/compare?view=columns',
    '#hfep/analysis?view=insertions', '#hfep/analysis?view=deletions', '#hfep/analysis?view=adjustments',
    ...['overview', 'categories', 'stats', 'review'].map(view => `#hfep/analysis?view=${view}`),
    '#hfep/analysis?stage=house&view=stats', '#hfep/analysis?view=stats&records=band:1', '#hfep/analysis?view=overview&records=region:CAR',
    '#hfep/house', '#hfep/house?view=facilities', '#hfep/house?view=review',
    '#hfep/nep', '#hfep/nep?view=tree&node=nep_hfep:p2:r47', '#hfep/nep?node=missing', '#hfep/nep?view=review',
    '#hfep/unknown'];
  for (const hash of routes) {
    window.location.hash = hash;
    const html = renderToString(React.createElement(HfepApp, {initialData: data}));
    if (!html.includes('<h1>') || html.includes('Loading HFEP sources')) throw new Error(`View did not render: ${hash}`);
    if (hash === '#hfep/home' && !html.includes('10,021,659,000')) throw new Error('Home control total missing');
    if (hash === '#hfep/nep?view=tree&node=nep_hfep:p2:r47' && !html.includes('Metro Manila')) throw new Error('Defect node evidence missing');
    if (hash === '#hfep/highlights?story=nep-defect' && !html.includes('metro_manila_med_overhang_140000')) throw new Error('Defect chain missing');
    if (hash === '#hfep/compare?view=columns' && !html.includes('4,451,000,000')) throw new Error('Column reconciliation total missing');
    if (hash === '#hfep/compare?view=pairs' && !html.includes('Line-item pairs')) throw new Error('Pairs view missing');
    console.log(`OK ${hash}`);
  }
} finally {await server.close();}

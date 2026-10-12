// Render the real loaded views through Vite's JSX loader, including deep links.
import React from 'react';
import {renderToString} from 'react-dom/server';
import fs from 'node:fs';
import {createServer} from 'vite';
const data=JSON.parse(fs.readFileSync(new URL('../../../other-analysis/data/fmr_workbench.json',import.meta.url),'utf8'));
globalThis.window={location:{href:'http://localhost/',hash:''},addEventListener(){},removeEventListener(){},matchMedia:() => ({matches:false})};
globalThis.location=window.location;
const server=await createServer({root:new URL('..',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
try {
  const {default:FmrApp}=await server.ssrLoadModule('/src/FmrApp.jsx');
  const routes=['#fmr/home','#fmr/highlights','#fmr/compare','#fmr/compare?view=projects','#fmr/compare?view=projects&page=3&sort=title&dir=asc',
    ...['overview','house_candidates','nep_candidates','adjustments','coordinates','stats','insertions','deletions','chainage','statistics'].map(view => `#fmr/analysis?view=${view}`),
    '#fmr/analysis?view=stats&records=band:1','#fmr/highlights?story=amount-changes','#fmr/highlights?story=control-increase',
    '#fmr/house','#fmr/house?view=review','#fmr/nep','#fmr/nep?view=projects&node=nep_fmr:p1:r5','#fmr/nep?node=missing','#fmr/unknown'];
  for (const hash of routes) {
    window.location.hash=hash;
    const html=renderToString(React.createElement(FmrApp,{initialData:data}));
    if(!html.includes('<h1>') || html.includes('Loading FMR sources')) throw new Error(`View did not render: ${hash}`);
    if(hash === '#compare' && !html.includes(data.regions[0].label)) throw new Error('Unpaginated regional rows missing');
    console.log(`OK ${hash}`);
  }
} finally {await server.close();}

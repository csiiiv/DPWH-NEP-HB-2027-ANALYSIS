// Render the real loaded views through Vite's JSX loader, including deep
// links — the standalone equivalent of the main workbench's fmrSmoke.mjs.
import React from 'react';
import {renderToString} from 'react-dom/server';
import fs from 'node:fs';
import {createServer} from 'vite';
const data=JSON.parse(fs.readFileSync(new URL('../../analysis-nia/data/nia_workbench.json',import.meta.url),'utf8'));
globalThis.window={location:{href:'http://localhost/',hash:''},addEventListener(){},removeEventListener(){},matchMedia:() => ({matches:false})};
globalThis.location=window.location;
const server=await createServer({root:new URL('..',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
try {
  const {default:NiaApp}=await server.ssrLoadModule('/src/NiaApp.jsx');
  // The map view needs WebGL — covered by the browser checks, not SSR.
  const routes=['#nia/home','#nia/highlights','#nia/compare','#nia/compare?view=projects',
    ...['overview','insertions','deletions','adjustments','stats','chainage','ai_monitoring','senate','candidates','controls'].map(view => `#nia/analysis?view=${view}`),
    '#nia/analysis?view=senate&senateView=all','#nia/house','#nia/house?view=review','#nia/nep','#nia/nep?node=missing','#nia/unknown'];
  for (const hash of routes) {
    window.location.hash=hash;
    const html=renderToString(React.createElement(NiaApp,{initialData:data}));
    if(!html.includes('<h1>') || html.includes('Loading NIA sources')) throw new Error(`View did not render: ${hash}`);
    console.log(`OK ${hash}`);
  }
} finally {await server.close();}

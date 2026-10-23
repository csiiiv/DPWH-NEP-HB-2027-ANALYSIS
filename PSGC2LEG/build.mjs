import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCrosswalk,materializePsgcCodes} from './lib.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const arg=(name)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null};
const sourcePaths=['sources/districts.json','sources/districts_generated.json'];
const primary=read(sourcePaths[0]),secondary=read(sourcePaths[1]);
const roster=JSON.parse(readFileSync(resolve(root,'../DEO2LEG/deo_leg_crosswalk.json'),'utf8'));
let data=buildCrosswalk({primary,secondary,roster});
const psgcFile=arg('--psgc');
if(psgcFile){
 const gazetteer=JSON.parse(readFileSync(resolve(process.cwd(),psgcFile),'utf8'));
 if(!Array.isArray(gazetteer))throw Error('PSGC gazetteer must be a JSON array of flattened location rows');
 data=materializePsgcCodes(data,gazetteer);
 data.metadata.psgcCodeVintage=arg('--psgc-version')||'unverified_external_psgc_version';
 data.metadata.psgcSourceSha256=createHash('sha256').update(readFileSync(resolve(process.cwd(),psgcFile))).digest('hex');
}
data.metadata.inputHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(p)]));
data.metadata.rosterSha256=createHash('sha256').update(readFileSync(resolve(root,'../DEO2LEG/deo_leg_crosswalk.json'))).digest('hex');
const result=JSON.stringify(data,null,2)+'\\n';
const target=resolve(root,'outputs/psgc_leg_crosswalk.json');
if(process.argv.includes('--check')){
 if(readFileSync(target,'utf8')!==result)throw Error('Published PSGC2LEG output has drifted; rebuild it');
 console.log('PSGC2LEG output matches source data');
}else{writeFileSync(target,result);console.log('Built '+target);}

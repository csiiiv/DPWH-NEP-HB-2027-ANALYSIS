import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {tracePsgc,findPsgc,findChildPsgc,verifyRegistry} from './psgc_registry.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const registry=JSON.parse(readFileSync(resolve(root,'outputs/psgc_admin_registry_2026-10-12.json'),'utf8'));
const [cmd,arg,arg2]=process.argv.slice(2);
if(!cmd||cmd==='--help'){
 console.log('Usage: node PSGC2LEG/psgc_registry_lookup.mjs <10-digit-PSGC-code>');
 console.log('       node PSGC2LEG/psgc_registry_lookup.mjs find <name> [parent-PSGC-code]');
 console.log('       node PSGC2LEG/psgc_registry_lookup.mjs children <parent-PSGC-code>');
 console.log('       node PSGC2LEG/psgc_registry_lookup.mjs check');
 process.exit(0);
}
const result=cmd==='check'?verifyRegistry(registry,{strict2026:true})
 :cmd==='find'?findPsgc(registry,arg,{parentCode:arg2??null})
 :cmd==='children'?findChildPsgc(registry,arg)
 :tracePsgc(registry,cmd);
console.log(JSON.stringify(result,null,2));

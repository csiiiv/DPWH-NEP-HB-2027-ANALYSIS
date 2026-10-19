import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildFlowSourcesData} from './src/flowSourcesData.js';
export {buildFlowSourcesData, normalizedFlowSources} from './src/flowSourcesData.js';

export function buildBudgetFlowSources() {
  const paths = {dpwh: '../data/comparison_projects_2027.json', fmr: '../../other-analysis/data/fmr_workbench.json',
    hfep: '../../other-analysis/data/hfep_workbench.json', nia: '../../analysis-nia/data/nia_workbench.json'};
  const inputs = {}, provenance = {};
  for (const [key, path] of Object.entries(paths)) {
    const raw = readFileSync(new URL(path, import.meta.url));
    inputs[key] = JSON.parse(raw);
    provenance[key] = {source: path.startsWith('../../') ? path.slice(6) : 'analysis/data/comparison_projects_2027.json', sha256: createHash('sha256').update(raw).digest('hex')};
  }
  const output = buildFlowSourcesData(inputs, provenance);
  writeFileSync(new URL('../data/budget_flow_sources_2027.json', import.meta.url), JSON.stringify(output) + '\n');
  return output;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = buildBudgetFlowSources();
  console.log(`Budget flow sources built: ${output.sources.length} datasets, ${output.sources.reduce((n, s) => n + Object.keys(s.groupings).length, 0)} intermediary choices`);
}

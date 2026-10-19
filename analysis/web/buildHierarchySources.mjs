import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildHierarchySourcesData} from './src/hierarchySourcesData.js';

export function buildHierarchySources() {
  const paths = {dpwh: '../data/comparison_projects_2027.json', fmr: '../../other-analysis/data/fmr_workbench.json',
    hfep: '../../other-analysis/data/hfep_workbench.json', nia: '../../analysis-nia/data/nia_workbench.json'};
  const inputs = {}, provenance = {};
  for (const [key, path] of Object.entries(paths)) {
    const raw = readFileSync(new URL(path, import.meta.url));
    inputs[key] = JSON.parse(raw);
    provenance[key] = {source: path.startsWith('../../') ? path.slice(6) : 'analysis/data/comparison_projects_2027.json',
      sha256: createHash('sha256').update(raw).digest('hex')};
  }
  const catalog = buildHierarchySourcesData(inputs, provenance);
  writeFileSync(new URL('../data/allocation_hierarchy_sources_2027.json', import.meta.url), JSON.stringify(catalog) + '\n');
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = buildHierarchySources();
  console.log(`Allocation hierarchies built: ${catalog.sources.length} datasets, NEP and HGAB3 for each`);
}

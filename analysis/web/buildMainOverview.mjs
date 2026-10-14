import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {overviewSummary} from './src/overviewSummary.js';

export function buildMainOverview() {
  const paths = {dpwhOverview: '../data/comparison_overview_2027.json', dpwhDetail: '../data/comparison_projects_2027.json',
    fmr: '../../other-analysis/data/fmr_workbench.json', hfep: '../../other-analysis/data/hfep_workbench.json',
    nia: '../../analysis-nia/data/nia_workbench.json'};
  const data = {}, provenance = {};
  for (const [key, path] of Object.entries(paths)) {
    const raw = readFileSync(new URL(path, import.meta.url));
    data[key] = JSON.parse(raw);
    if (data[key].schema_version !== 1) throw new Error(`Unsupported ${key} schema`);
    provenance[key] = {path: path.startsWith('../../') ? path.slice(6) : 'analysis/' + path.slice(3), sha256: createHash('sha256').update(raw).digest('hex')};
  }
  const summary = {...overviewSummary(data, new Date().toISOString()), input_provenance: provenance};
  writeFileSync(new URL('../data/main_overview_2027.json', import.meta.url), JSON.stringify(summary) + '\n');
  return summary;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = buildMainOverview();
  process.stdout.write(`Overview summary built: ${data.workspaces.length} validated funding workspaces\n`);
}

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {exportResults} from './src/comparisonExport.js';

// Build-time counterpart of the in-app Compare → Export CSV button: one
// complete CSV per DPWH dataset covering every comparison row (all stages,
// all candidate populations) so the Sources workspace can offer a stable
// download instead of requiring a filtered in-app export.
export function buildCsvExports() {
  const detail = JSON.parse(readFileSync(new URL('../data/comparison_projects_2027.json', import.meta.url)));
  if (detail.schema_version !== 1) throw new Error('Unsupported comparison detail schema');
  const csv = exportResults(detail.projects, {tab: 'projects'}, 'csv');
  const rows = csv.split('\r\n').length - 1;
  if (rows !== detail.projects.length) throw new Error(`CSV row count ${rows} !== ${detail.projects.length} comparison rows`);
  writeFileSync(new URL('../data/dpwh_comparison_all_2027.csv', import.meta.url), csv);
  return {rows, bytes: csv.length};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {rows, bytes} = buildCsvExports();
  process.stdout.write(`DPWH comparison CSV built: ${rows} rows, ${(bytes / 1024 / 1024).toFixed(1)} MB\n`);
}

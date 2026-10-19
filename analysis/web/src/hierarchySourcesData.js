import {buildNepHierarchy, buildHgab3Hierarchy} from './nepHierarchy.js';
import {buildAllocationTree, hierarchyLevels, hierarchyRoots} from './allocationHierarchy.js';
import {normalizedFlowSources} from './flowSourcesData.js';
import {buildStageIndex, facilityScope, COMPONENT_COLUMNS, COLUMN_LABELS, recordColumnAmount} from './hfepModel.js';

const heading = (value, id = value) => ({id: String(id || '(Not recorded)'), label: String(value || '(Not recorded)')});
const level = (key, label, singular, plural, filterLabel, allLabel, filter = true) =>
  ({key, label, singular, plural, filterLabel, allLabel, filter});
const project = level('project', 'Project', 'project', 'projects', 'Focus project', 'All projects', false);
const region = level('region', 'Region', 'regional branch', 'regional branches', 'Focus region', 'All regions');

function annexHierarchy(data, side, key, expected) {
  const source = data.stages[side];
  if (key === 'hfep') {
    const levels = [
      level('category', 'Facility category', 'facility category', 'facility categories', 'Focus category', 'All categories'),
      level('subcategory', 'Facility subcategory', 'facility subcategory', 'facility subcategories', 'Focus subcategory', 'All subcategories'),
      region, level('province', 'Province', 'province branch', 'province branches', 'Focus province', 'All provinces'),
      level('facility', 'Facility', 'facility', 'facilities', 'Focus facility', 'All facilities', false),
      level('component', 'Funding component', 'component allocation', 'component allocations', 'Focus component', 'All components', false),
    ];
    const index = buildStageIndex(source);
    const records = source.facilities.flatMap(f => {
      const scope = facilityScope(index, f);
      return COMPONENT_COLUMNS.filter(column => recordColumnAmount(f, column) != null).map(column => ({
        id: `${f.id}:${column}`, amount_php: recordColumnAmount(f, column),
        path: [heading(scope.category), heading(scope.subcategory), heading(scope.region), heading(scope.province),
          heading(f.title, f.id), heading(COLUMN_LABELS[column], column)],
      }));
    });
    return {...buildAllocationTree(records, levels, expected), defaultEnd: 'region'};
  }
  const levels = key === 'fmr' ? [
    {...region, singular: 'region', plural: 'regions'}, project,
  ] : [
    level('program', 'Program group', 'program group', 'program groups', 'Focus program group', 'All program groups'),
    level('subprogram', 'Sub-program', 'sub-program', 'sub-programs', 'Focus sub-program', 'All sub-programs'), project,
  ];
  const records = source.projects.map(p => ({id: p.id, amount_php: p.amount_php,
    path: key === 'fmr' ? [heading(p.region, p.region_key), heading(p.title, p.id)]
      : [heading(p.program_group), heading(p.subprogram_label || p.subprogram_key, p.subprogram_key), heading(p.title, p.id)],
  }));
  return {...buildAllocationTree(records, levels, expected), defaultEnd: key === 'fmr' ? 'region' : 'subprogram'};
}

export function buildHierarchySourcesData(inputs, provenance = {}) {
  const sources = normalizedFlowSources(inputs).map(definition => {
    const {key, label, scope, house_note} = definition;
    if (key !== 'dpwh') {
      const audit = inputs[key].stages.house.audit_summary;
      if (!(audit?.reading_comparison_total_pages > 0 && audit.reading_comparison_identical_pages === audit.reading_comparison_total_pages))
        throw new Error(`${key}: House reading identity is not verified`);
    }
    const notes = {
      dpwh: 'FAPs stay separate. Regions and implementing offices use the selected ledger’s recorded assignments. Central Office, regional offices and missing-office labels remain alongside DEOs.',
      fmr: 'Projects are counted once across coordinate segments. Region headings and project titles come from the selected ledger. Implementing-office assignments are not available in this annex.',
      hfep: 'Only printed infrastructure, medical-equipment and motor-vehicle component allocations are counted. Facility total columns are not added again. The NEP facility ledger is ₱140,000 below its printed annex control; no balancing allocation is added. Geographic headings are retained as printed.',
      nia: 'The six detailed irrigation sub-programs are included. Agency-only CARP and broader agency controls are excluded. Regional and DEO assignments are not recorded in this source and are not inferred from project titles.',
    }[key];
    const stageHierarchy = stage => {
      if (key !== 'dpwh') return annexHierarchy(inputs[key], stage === 'nep' ? 'nep' : 'house', key,
        definition.expected[stage === 'nep' ? 'before' : 'after']);
      const legacy = stage === 'nep' ? buildNepHierarchy(inputs.dpwh.projects) : buildHgab3Hierarchy(inputs.dpwh.projects);
      return {rows: legacy.rows, amount_php: legacy.amount_php, levels: hierarchyLevels(legacy), roots: hierarchyRoots(legacy), defaultEnd: 'pap'};
    };
    return {dataset: {key, label, scope, house_note, notes}, provenance: provenance[key],
      hierarchies: {nep: stageHierarchy('nep'), hgab3: stageHierarchy('hgab3')}};
  });
  return {schema_version: 1, fiscal_year: 2027, sources};
}

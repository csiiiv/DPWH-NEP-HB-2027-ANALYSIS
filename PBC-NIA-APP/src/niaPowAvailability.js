// Helpers for the Document availability analysis view (PBC Program of Works).

export const powMatchLabels = {
  strong: 'Strong match',
  weak: 'Weak match',
  review: 'Needs review',
  unmatched: 'Unmatched',
};

export const powSupportLabels = {
  supported: 'Supported (any docs)',
  pow: 'With POW',
  photos: 'With geotagged photos',
  none: 'No supporting docs',
  unsupported: 'No supporting docs',
};

export function powSupportScale(summary = {}) {
  if (Array.isArray(summary.support_scale) && summary.support_scale.length) {
    return summary.support_scale;
  }
  const total = summary.senate_projects || 0;
  const none = summary.senate_projects_unsupported
    ?? Math.max(0, total - (summary.senate_projects_with_docs || 0));
  return [
    {id: 'pow', label: 'With POW', count: summary.senate_projects_with_pow || summary.senate_projects_with_docs || 0,
      detail: 'Program of Works PDF in the PBC drop'},
    {id: 'photos', label: 'With geotagged photos', count: summary.senate_projects_with_photos || 0,
      detail: 'Site pictures / picture sheets in the PBC drop'},
    {id: 'none', label: 'No supporting docs', count: none,
      detail: 'No package in this drop mapped to the Senate row'},
  ];
}

export function filterPowCoverage(coverage, params = {}) {
  const terms = String(params.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const region = params.powRegion || '';
  const strength = params.powMatch || '';
  const support = params.powSupport || '';
  return (coverage || []).filter(p => {
    if (support === 'supported' && !p.supported) return false;
    if (support === 'unsupported' || support === 'none') {
      if (p.supported) return false;
    }
    if (support === 'pow' && !p.has_pow) return false;
    if (support === 'photos' && !p.has_photos) return false;
    if (region && p.region !== region && !regionFolderMatches(p.region, region)) return false;
    if (strength) {
      if (!p.supported) return false;
      if (p.match_strength !== strength) return false;
    }
    if (!terms.length) return true;
    const hay = `${p.title || ''} ${p.region || ''} ${p.category || ''} ${p.senate_id || ''} ${(p.packages || []).map(x => x.package_name).join(' ')}`.toLocaleLowerCase();
    return terms.every(t => hay.includes(t));
  });
}

export function filterPowProjects(projects, params = {}) {
  return filterPowCoverage(projects, params);
}

export function filterPowPackages(packages, params = {}) {
  const terms = String(params.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const region = params.powRegion || '';
  const strength = params.powMatch || '';
  return (packages || []).filter(p => {
    if (region && p.region_folder !== region) return false;
    if (strength && p.match_strength !== strength) return false;
    if (!terms.length) return true;
    const hay = `${p.name || ''} ${p.region_folder || ''} ${p.system_guess || ''} ${p.category_hint || ''} ${p.best_match?.title || ''}`.toLocaleLowerCase();
    return terms.every(t => hay.includes(t));
  });
}

function regionFolderMatches(senateRegion, folder) {
  const map = {
    CAR: ['Cordillera Administrative Region', 'CAR'],
    'REGION 1': ['Region 1'],
    'REGION 2': ['Region 2'],
    'REGION 3': ['Region 3', 'REGION 3'],
    'REGION 4A': ['Region 4A', 'Region IV-A'],
    'REGION 4B': ['Region 4B', 'Region IV-B'],
    'REGION 5': ['Region 5'],
    'REGION 6': ['Region 6'],
    'REGION 7': ['Region 7'],
    'REGION 8': ['Region 8'],
    'REGION 9': ['Region 9'],
    'REGION 10': ['Region 10'],
    'REGION 11': ['Region 11'],
    'REGION 12': ['Region 12'],
    'REGION 13': ['Region 13'],
    MARIIS: ['MARIIS'],
    UPRIIS: ['UPRIIS'],
  };
  return (map[folder] || []).includes(senateRegion);
}

export function powRegionOptions(byRegion = []) {
  return byRegion.map(r => r.region_folder);
}

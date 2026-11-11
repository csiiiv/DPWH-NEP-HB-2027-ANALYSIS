// GEOAGRI surveyed-alignment overlay support.
// Loads other-analysis/data/geoagri_fmr_geometry.json (built by
// DA_FMR_DATA/publish_geoagri_bundle.py from the GEOAGRI FMR Proposals API)
// and resolves the surveyed MultiLineString for a workbench project id.
import {siteUrl} from './data.js';

let cache = null;
let pending = null;
let proposalsById = null;

/** Resolve the join index entry ({tier, score, pid}) to include its proposal. */
function hydrate(bundle, ref) {
  if (!ref) return null;
  if (proposalsById === null) {
    proposalsById = new Map((bundle.proposals || []).map(p => [p.id, p]));
  }
  const proposal = proposalsById.get(ref.pid);
  return proposal ? {tier: ref.tier, score: ref.score, proposal} : null;
}

/** Returns {tier, score, proposal} or null for a NEP/House/DA project. */
export function geoagriForProject(bundle, stage, project) {
  if (!bundle || !project) return null;
  let ref = null;
  if (stage === 'nep') ref = bundle.by_nep_id?.[project.id];
  else if (stage === 'house') ref = bundle.by_house_id?.[project.id];
  else if (stage === 'da' && project.control_no) ref = bundle.by_control_no?.[project.control_no];
  return hydrate(bundle, ref);
}

/** GeoJSON FeatureCollection of LineStrings for a bundle entry, or null. */
export function geoagriLineFeatures(entry) {
  const lines = entry?.proposal?.coordinates?.lines;
  if (!Array.isArray(lines) || !lines.length) return null;
  const features = lines
    .filter(line => Array.isArray(line) && line.length >= 2
      && line.every(c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite)))
    .map((line, index) => ({
      type: 'Feature',
      id: `geoagri:${entry.proposal.id}:${index}`,
      properties: {
        geoagriId: entry.proposal.id,
        fmrcode: entry.proposal.fmrcode,
        roadName: entry.proposal.road_name,
        tier: entry.tier,
        score: entry.score,
        geoagri: true,
      },
      geometry: {type: 'LineString', coordinates: line},
    }));
  return features.length ? {type: 'FeatureCollection', features} : null;
}

/** Load the bundle once; concurrent callers share the in-flight request. */
export function loadGeoagriBundle(signal) {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(siteUrl('other-analysis/data/geoagri_fmr_geometry.json'), {signal})
    .then(r => {
      if (!r.ok) throw Error(`GEOAGRI bundle request failed (${r.status})`);
      return r.json();
    })
    .then(d => {
      cache = d;
      proposalsById = null;
      return d;
    })
    .catch(e => {
      pending = null;  // allow retry after a failure
      throw e;
    });
  return pending;
}

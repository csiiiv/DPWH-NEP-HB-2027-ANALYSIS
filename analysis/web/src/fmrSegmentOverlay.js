import {
  DIGIT_REPAIR_PRINTED, RED_FLAG_COLOR, drawableSegments, pointCoordinates,
  reviewedPointCoordinates, PAIRED_COLOR, STAGE_COLORS,
} from './fmrMapModel.js';

export const DISTRICT_SEGMENT_CLASSES = {
  nep_only: {label: 'NEP only', color: STAGE_COLORS.nep},
  house_only: {label: 'House only', color: STAGE_COLORS.house},
  paired: {label: 'Matched', color: PAIRED_COLOR},
};

/** Pre-repair printed geometry is drawn in red, distinct from both stage colors. */
export const REPAIR_COLOR = RED_FLAG_COLOR;

/** Rules that mark a point as carrying an accepted coordinate repair. */
const REPAIR_RULES = ['off_by_one_digit_repair_accepted', 'source_numeric_repair_accepted'];

/** Great-circle distance in km between two [lon,lat] pairs. */
function shiftKm(before, after) {
  const [lon1, lat1] = before, [lon2, lat2] = after;
  const phi1 = (lat1 * Math.PI) / 180, phi2 = (lat2 * Math.PI) / 180;
  const dPhi = phi2 - phi1, dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fmrStageProjects(record) {
  return [
    {key: 'house', label: 'House FMR annex', project: record.fmrProjects?.house, color: STAGE_COLORS.house},
    {key: 'nep', label: 'NEP FMR schedule', project: record.fmrProjects?.nep, color: STAGE_COLORS.nep},
  ].filter(entry => entry.project);
}

/** Reviewed source geometry for one Congress FMR comparison row. */
export function fmrRecordMapOverlay(record) {
  const stages = fmrStageProjects(record);
  const lines = stages.flatMap(({key, label, project, color}) =>
    drawableSegments(project, 'reviewed').map(segment => ({
      type: 'Feature',
      id: `${key}:${segment.id}`,
      properties: {
        stage: key,
        stageLabel: label,
        projectId: project.id,
        segmentId: segment.id,
        sectionLabel: segment.section_label || `Section ${segment.segment_index}`,
        distanceKm: segment.straight_line_distance_km ?? null,
        color,
      },
      geometry: {type: 'LineString', coordinates: segment.coordinates},
    })));
  const points = stages.flatMap(({key, label, project, color}) =>
    (project.points || []).flatMap(point => {
      const coordinates = pointCoordinates(point, 'reviewed');
      return coordinates ? [{
        type: 'Feature',
        id: `${key}:${point.id}`,
        properties: {stage: key, stageLabel: label, projectId: project.id,
          pointId: point.id, role: point.role || 'point', color},
        geometry: {type: 'Point', coordinates},
      }] : [];
    }));
  return {
    stages,
    lines: {type: 'FeatureCollection', features: lines},
    points: {type: 'FeatureCollection', features: points},
  };
}

/**
 * Pre-acceptance printed geometry for the points on this row whose accepted
 * digit repair actually moved the coordinate.
 *
 * The corrected (reviewed) line stays the primary drawing; this returns the
 * printed twin plus a dashed connector from each printed position to its
 * accepted position, so a reviewer can see what the source printed and what the
 * acceptance moved it to.
 *
 * A point is drawn only when it has a retained pre-acceptance reading that
 * differs from its reviewed coordinate. That excludes repairs whose accepted
 * value equals the printed one (a numeric re-read with no geometry change), so
 * a red twin can never sit on top of the corrected line and imply a move that
 * did not happen. Sections with no such point are skipped entirely.
 *
 * Pre-acceptance readings come from DIGIT_REPAIR_PRINTED — the same table the
 * full FMR map's Normalized basis restores — cross-checked against the point's
 * own accepted repair rule. Nothing is inferred here.
 */
export function fmrRecordRepairOverlay(record) {
  const lines = [], connectors = [], printedPoints = [], stages = [];
  for (const {key, label, project} of fmrStageProjects(record)) {
    const points = project.points || [];
    const repaired = new Map();
    for (const point of points) {
      const before = DIGIT_REPAIR_PRINTED[point.id];
      const after = reviewedPointCoordinates(point);
      const ruled = (point.rules || []).some(rule => REPAIR_RULES.includes(rule));
      if (!before || !after || !ruled) continue;
      if (before[0] === after[0] && before[1] === after[1]) continue;
      repaired.set(point.id, {before, after, rules: point.rules || [],
        shiftKm: shiftKm(before, after)});
    }
    if (!repaired.size) continue;
    stages.push({
      key, label, project,
      points: [...repaired].map(([pointId, entry]) => ({pointId, ...entry})).sort((a, b) =>
        a.pointId.localeCompare(b.pointId)),
    });
    for (const segment of project.segments || []) {
      const ids = segment.point_ids || [];
      const moved = ids.filter(id => repaired.has(id));
      if (!moved.length) continue;
      const coordinates = ids.map(id => repaired.get(id)?.before
        ?? reviewedPointCoordinates(points.find(point => point.id === id)));
      if (!coordinates.every(pair => pair)) continue;
      const properties = {stage: key, stageLabel: label, projectId: project.id,
        segmentId: segment.id, repairedPointIds: moved.join(';'), color: REPAIR_COLOR};
      lines.push({type: 'Feature', id: `printed:${key}:${segment.id}`,
        properties, geometry: {type: 'LineString', coordinates}});
      for (const id of moved) {
        const {before, after} = repaired.get(id);
        connectors.push({type: 'Feature', id: `repair-link:${key}:${id}`,
          properties, geometry: {type: 'LineString', coordinates: [before, after]}});
        printedPoints.push({type: 'Feature', id: `printed-point:${key}:${id}`,
          properties: {stage: key, stageLabel: label, projectId: project.id,
            pointId: id, role: 'printed', color: REPAIR_COLOR},
          geometry: {type: 'Point', coordinates: before}});
      }
    }
  }
  return {
    stages,
    hasRepairs: Boolean(lines.length || printedPoints.length),
    repairedPoints: stages.reduce((total, stage) => total + stage.points.length, 0),
    lines: {type: 'FeatureCollection', features: lines},
    connectors: {type: 'FeatureCollection', features: connectors},
    printedPoints: {type: 'FeatureCollection', features: printedPoints},
  };
}

/** Coordinates that define the frame; printed twins are optional so a ~1000 km
 *  repair does not shrink the corrected segment to a speck by default. */
export function overlayFrameCoordinates(overlay, repair, {includePrinted = false} = {}) {
  const coordinates = [
    ...overlay.lines.features.flatMap(feature => feature.geometry.coordinates),
    ...overlay.points.features.map(feature => feature.geometry.coordinates),
  ];
  if (includePrinted && repair?.hasRepairs) {
    coordinates.push(
      ...repair.lines.features.flatMap(feature => feature.geometry.coordinates),
      ...repair.connectors.features.flatMap(feature => feature.geometry.coordinates),
    );
  }
  return coordinates;
}

function comparisonClass(record) {
  return record.status === 'paired' ? 'paired'
    : record.status === 'house_only' ? 'house_only' : 'nep_only';
}

/** Every retained segment/point for all comparison rows on one district card. */
export function fmrDistrictMapOverlay(records) {
  const lines = [], points = [];
  for (const record of records) {
    const category = comparisonClass(record);
    const style = DISTRICT_SEGMENT_CLASSES[category];
    for (const {key: stage, project} of fmrStageProjects(record)) {
      for (const segment of drawableSegments(project, 'reviewed')) {
        lines.push({
          type: 'Feature',
          id: `line:${record.id}:${stage}:${segment.id}`,
          properties: {
            recordId: record.id,
            projectId: project.id,
            title: record.title,
            category,
            categoryLabel: style.label,
            stage,
            segmentId: segment.id,
            sectionLabel: segment.section_label || `Section ${segment.segment_index}`,
            distanceKm: segment.straight_line_distance_km ?? null,
            color: style.color,
          },
          geometry: {type: 'LineString', coordinates: segment.coordinates},
        });
      }
      for (const point of project.points || []) {
        const coordinates = pointCoordinates(point, 'reviewed');
        if (!coordinates) continue;
        points.push({
          type: 'Feature',
          id: `point:${record.id}:${stage}:${point.id}`,
          properties: {
            recordId: record.id,
            projectId: project.id,
            title: record.title,
            category,
            categoryLabel: style.label,
            stage,
            pointId: point.id,
            role: point.role || 'point',
            color: style.color,
          },
          geometry: {type: 'Point', coordinates},
        });
      }
    }
  }
  const counts = Object.fromEntries(Object.keys(DISTRICT_SEGMENT_CLASSES).map(category => [category, {
    records: records.filter(record => comparisonClass(record) === category).length,
    segments: lines.filter(feature => feature.properties.category === category).length,
  }]));
  return {
    lines: {type: 'FeatureCollection', features: lines},
    points: {type: 'FeatureCollection', features: points},
    counts,
  };
}

import {drawableSegments, pointCoordinates, PAIRED_COLOR, STAGE_COLORS} from './fmrMapModel.js';

export const DISTRICT_SEGMENT_CLASSES = {
  nep_only: {label: 'NEP only', color: STAGE_COLORS.nep},
  house_only: {label: 'House only', color: STAGE_COLORS.house},
  paired: {label: 'Matched', color: PAIRED_COLOR},
};

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

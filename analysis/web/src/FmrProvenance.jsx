import React from 'react';
import {flagLabel, hadCoordinateInterpretation} from './fmrModel.js';

export function CoordinateBadge({project}) {
  if (!project) return null;
  const interpreted = hadCoordinateInterpretation(project);
  const label = project.status === 'needs_review' ? 'Needs review' : interpreted ? 'Normalized · interpreted' : 'Normalized';
  return <span className={`fmr-badge ${project.status === 'needs_review' ? 'review' : interpreted ? 'interpreted' : 'balanced'}`}>{label}{project.segment_count > 1 && ` · ${project.segment_count} segments`}</span>;
}

export function FlagList({flags, empty}) {
  if (!flags?.length) return <p className="fmr-muted">{empty}</p>;
  return <ul className="fmr-flag-list">{flags.map(f => <li key={f}><code>{f}</code> · {flagLabel(f)}</li>)}</ul>;
}

function pointValue(point) {
  if (point.longitude == null || point.latitude == null) return '— unavailable —';
  return `[${point.longitude}, ${point.latitude}]`;
}

/** Full pre-normalizer → interpretation → remaining-flag trail for one project. */
export function CoordinateProvenance({project}) {
  if (!project) return null;
  const points = project.points || [];
  const basis = flagLabel(project.coordinate_text_basis || 'original_ocr');
  const interpretedText = project.coordinates_interpreted && project.coordinates_interpreted !== project.coordinates_raw;
  return <div className="fmr-provenance">
    <h3>Coordinate provenance</h3>
    <p className="fmr-muted">Traceability from the printed/OCR cell through interpretation. Raw text is never rewritten; rules record how values were read.</p>
    <dl className="fmr-provenance-summary">
      <div><dt>Outcome</dt><dd><CoordinateBadge project={project}/></dd></div>
      <div><dt>Text basis</dt><dd>{basis}</dd></div>
    </dl>
    <div className="fmr-provenance-step">
      <h4>1. Pre-normalizer extraction flags</h4>
      <FlagList flags={project.original_review_flags} empty="None — first extractor accepted the cell without coordinate flags."/>
    </div>
    <div className="fmr-provenance-step">
      <h4>2. Interpretation applied</h4>
      <FlagList flags={project.normalization_rules} empty="None — values parsed as written (no format conversion or reorder)."/>
    </div>
    <div className="fmr-provenance-step">
      <h4>3. Remaining review flags</h4>
      <FlagList flags={project.review_flags} empty="None — fully normalized; no open coordinate findings."/>
    </div>
    <h4>Coordinates as extracted</h4>
    <pre>{project.coordinates_raw}</pre>
    {interpretedText && <><h4>Image-reviewed transcription</h4><pre>{project.coordinates_interpreted}</pre>
      <p className="fmr-muted">Transcription differs from the first OCR pass; numeric interpretation still follows the rules above.</p></>}
    {points.length > 0 && <>
      <h4>Point-level updates</h4>
      <p className="fmr-muted">Each retained endpoint: source fragment → interpreted [longitude, latitude], with per-point rules and issues.</p>
      <table className="fmr-provenance-table"><caption className="sr-only">Point provenance</caption>
        <thead><tr><th scope="col">Point</th><th scope="col">Role</th><th scope="col">Source fragment</th><th scope="col">Interpreted [lon, lat]</th><th scope="col">Rules / issues</th></tr></thead>
        <tbody>{points.map(pt => {
          const frag = (pt.source_fragment_interpreted && pt.source_fragment_interpreted !== pt.source_fragment_raw)
            ? `${pt.source_fragment_raw || '—'} → ${pt.source_fragment_interpreted}`
            : (pt.source_fragment_raw || '—');
          const notes = [...(pt.rules || []).map(r => `rule: ${flagLabel(r)}`), ...(pt.issues || []).map(i => `issue: ${flagLabel(i)}`)];
          return <tr key={pt.id}>
            <td><code>{pt.id.split(':').slice(-1)[0]}</code></td>
            <td>{pt.role || '—'}</td>
            <td><code className="fmr-frag">{frag}</code></td>
            <td><code>{pointValue(pt)}</code></td>
            <td>{notes.length ? notes.join('; ') : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
    </>}
  </div>;
}

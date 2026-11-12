import React, {useId, useMemo, useRef, useState} from 'react';
import {money} from './niaModel.js';
import {formatLengthKm} from './chainageDisplay.js';
import {preferredChainageTitle} from './niaAnalysis.js';

const WIDTH = 320;
const PLOT_H = 28;
const AXIS_H = 16;
const HEIGHT = PLOT_H + AXIS_H;
const PAD_L = 14;
const PAD_R = 14;

const SCATTER_W = 820;
const SCATTER_PLOT_H = 220;
const SCATTER_AXIS_H = 28;
const SCATTER_H = SCATTER_PLOT_H + SCATTER_AXIS_H;
const SCATTER_PAD_L = 28;
const SCATTER_PAD_R = 28;

function logPos(value, domain, width, padL, padR) {
  const min = Math.max(domain.min, Number.MIN_VALUE);
  const max = Math.max(domain.max, min * 1.0001);
  const t = (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return padL + Math.min(1, Math.max(0, t)) * (width - padL - padR);
}

function niceLogTicks(domain) {
  const min = Math.max(domain.min, Number.MIN_VALUE);
  const max = Math.max(domain.max, min * 1.0001);
  const start = Math.ceil(Math.log10(min) - 1e-9);
  const end = Math.floor(Math.log10(max) + 1e-9);
  const ticks = [];
  for (let e = start; e <= end; e++) {
    const v = 10 ** e;
    if (v >= min * 0.999 && v <= max * 1.001) ticks.push(v);
  }
  if (!ticks.length) ticks.push(min, max);
  return ticks;
}

export function formatPhpPerMTick(value) {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `₱${Number.isInteger(m) ? m : m.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `₱${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return money(Math.round(value));
}

function jitterY(index, seed = 0) {
  const n = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function isOutlier(rate, row) {
  const lo = row.whisker_low ?? row.min;
  const hi = row.whisker_high ?? row.max;
  return rate < lo || rate > hi;
}

/** Shared log axis header (same geometry as each strip’s bottom ticks). */
export function PhpPerMStripAxis({domain, width = WIDTH}) {
  const ticks = niceLogTicks(domain);
  return <svg className="nia-ppm-axis" width={width} height={AXIS_H + 4} role="img"
    aria-label={`₱ per meter log scale from ${formatPhpPerMTick(domain.min)} to ${formatPhpPerMTick(domain.max)}`}>
    <line x1={PAD_L} x2={width - PAD_R} y1={2} y2={2} className="nia-ppm-axis-line"/>
    {ticks.map(tick => {
      const x = logPos(tick, domain, width, PAD_L, PAD_R);
      return <g key={tick}>
        <line x1={x} x2={x} y1={2} y2={7} className="nia-ppm-axis-tick"/>
        <text x={x} y={18} textAnchor="middle" className="nia-ppm-axis-label">{formatPhpPerMTick(tick)}</text>
      </g>;
    })}
  </svg>;
}

/**
 * Compact Tukey box + jitter strip. Click opens the large interactive scatter.
 */
export function PhpPerMStrip({row, domain, width = WIDTH, height = HEIGHT, onOpen}) {
  const uid = useId();
  const rates = row?.rates || [];
  const chart = useMemo(() => {
    if (!rates.length || row.median == null) return null;
    const midY = PLOT_H / 2;
    const boxH = 14;
    const x25 = logPos(row.p25, domain, width, PAD_L, PAD_R);
    const x75 = logPos(row.p75, domain, width, PAD_L, PAD_R);
    const xMed = logPos(row.median, domain, width, PAD_L, PAD_R);
    const xWLo = logPos(row.whisker_low ?? row.min, domain, width, PAD_L, PAD_R);
    const xWHi = logPos(row.whisker_high ?? row.max, domain, width, PAD_L, PAD_R);
    const ticks = niceLogTicks(domain).map(tick => ({
      tick, x: logPos(tick, domain, width, PAD_L, PAD_R),
    }));
    const points = rates.map((rate, i) => ({
      rate,
      x: logPos(rate, domain, width, PAD_L, PAD_R),
      y: midY + jitterY(i, row.id?.length || 0) * (boxH * 0.55),
      outlier: isOutlier(rate, row),
    }));
    return {midY, boxH, x25, x75, xMed, xWLo, xWHi, points, ticks};
  }, [rates, row, domain, width]);

  if (!chart) {
    return <span className="nia-ppm-empty" aria-label="No chainage rates">—</span>;
  }

  const label = `₱/m distribution: median ${money(Math.round(row.median))}, `
    + `P25–P75 ${money(Math.round(row.p25))}–${money(Math.round(row.p75))}, `
    + `n=${rates.length}. Click to open interactive plot.`;

  const svg = <svg className="nia-ppm-strip" width={width} height={height} aria-hidden={onOpen ? true : undefined}
    role={onOpen ? undefined : 'img'} aria-label={onOpen ? undefined : label}>
    <title>{label}</title>
    {chart.ticks.map(({tick, x}) =>
      <g key={`tick-${tick}`} className="nia-ppm-tick">
        <line x1={x} x2={x} y1={2} y2={PLOT_H - 2} className="nia-ppm-grid"/>
        <line x1={x} x2={x} y1={PLOT_H} y2={PLOT_H + 4} className="nia-ppm-axis-tick"/>
        <text x={x} y={PLOT_H + 13} textAnchor="middle" className="nia-ppm-axis-label">{formatPhpPerMTick(tick)}</text>
      </g>)}
    <line x1={chart.xWLo} x2={chart.x25} y1={chart.midY} y2={chart.midY} className="nia-ppm-whisker"/>
    <line x1={chart.x75} x2={chart.xWHi} y1={chart.midY} y2={chart.midY} className="nia-ppm-whisker"/>
    <line x1={chart.xWLo} x2={chart.xWLo} y1={chart.midY - 6} y2={chart.midY + 6} className="nia-ppm-whisker"/>
    <line x1={chart.xWHi} x2={chart.xWHi} y1={chart.midY - 6} y2={chart.midY + 6} className="nia-ppm-whisker"/>
    <rect x={Math.min(chart.x25, chart.x75)} y={chart.midY - chart.boxH / 2}
      width={Math.max(2, Math.abs(chart.x75 - chart.x25))} height={chart.boxH}
      className="nia-ppm-box" rx={2}/>
    <line x1={chart.xMed} x2={chart.xMed}
      y1={chart.midY - chart.boxH / 2 - 1} y2={chart.midY + chart.boxH / 2 + 1}
      className="nia-ppm-median"/>
    {chart.points.map((pt, i) =>
      <circle key={`${uid}-${i}`} cx={pt.x} cy={pt.y} r={pt.outlier ? 2.4 : 2}
        className={pt.outlier ? 'nia-ppm-dot is-outlier' : 'nia-ppm-dot'}/>)}
  </svg>;

  if (!onOpen) return svg;
  return <button type="button" className="nia-ppm-strip-btn" onClick={() => onOpen(row)}
    aria-label={label} title="Open interactive ₱/m scatter">
    {svg}
  </button>;
}

/** Build interactive scatter points from stage projects + group stats row. */
export function phpPerMScatterPoints(projects, row, domain, width = SCATTER_W, plotH = SCATTER_PLOT_H) {
  const midY = plotH / 2;
  const amp = Math.min(72, Math.max(28, plotH * 0.32));
  const seed = row?.id?.length || 0;
  return projects
    .filter(p => Number.isFinite(p.php_per_m) && p.php_per_m > 0)
    .map((p, i) => ({
      project: p,
      rate: p.php_per_m,
      outlier: isOutlier(p.php_per_m, row),
      x: logPos(p.php_per_m, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
      y: midY + jitterY(i, seed) * amp,
    }))
    .sort((a, b) => a.rate - b.rate);
}

/**
 * Large interactive log-x scatter with box/whiskers.
 * Hover → overview card; click → caller opens full project detail.
 */
export function PhpPerMScatterPlot({
  row, domain, points, selectedId, onSelect,
  width = SCATTER_W, plotH = SCATTER_PLOT_H,
}) {
  const height = plotH + SCATTER_AXIS_H;
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // {point, left, top}
  const ticks = useMemo(() => niceLogTicks(domain).map(tick => ({
    tick, x: logPos(tick, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
  })), [domain, width]);

  const box = useMemo(() => {
    if (row?.median == null) return null;
    const midY = plotH / 2;
    const boxH = 36;
    return {
      midY, boxH,
      x25: logPos(row.p25, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
      x75: logPos(row.p75, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
      xMed: logPos(row.median, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
      xWLo: logPos(row.whisker_low ?? row.min, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
      xWHi: logPos(row.whisker_high ?? row.max, domain, width, SCATTER_PAD_L, SCATTER_PAD_R),
    };
  }, [row, domain, width, plotH]);

  function placeHover(point, evt) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) {setHover({point, left: point.x, top: point.y}); return;}
    const left = Math.min(rect.width - 280, Math.max(8, evt.clientX - rect.left + 14));
    const top = Math.min(rect.height - 120, Math.max(8, evt.clientY - rect.top - 12));
    setHover({point, left, top});
  }

  if (!box || !points?.length) {
    return <p className="nia-ppm-empty">No chainage rates in this group.</p>;
  }

  return <div className="nia-ppm-scatter-wrap" ref={wrapRef}
    onMouseLeave={() => setHover(null)}>
    <svg className="nia-ppm-scatter" width={width} height={height} role="img"
      aria-label={`Interactive ₱/m scatter for ${row.label}, ${points.length} projects`}>
      {ticks.map(({tick, x}) =>
        <g key={tick}>
          <line x1={x} x2={x} y1={8} y2={plotH - 4} className="nia-ppm-grid"/>
          <line x1={x} x2={x} y1={plotH} y2={plotH + 6} className="nia-ppm-axis-tick"/>
          <text x={x} y={plotH + 20} textAnchor="middle" className="nia-ppm-axis-label nia-ppm-scatter-tick">
            {formatPhpPerMTick(tick)}</text>
        </g>)}
      <line x1={SCATTER_PAD_L} x2={width - SCATTER_PAD_R} y1={plotH} y2={plotH} className="nia-ppm-axis-line"/>
      <line x1={box.xWLo} x2={box.x25} y1={box.midY} y2={box.midY} className="nia-ppm-whisker"/>
      <line x1={box.x75} x2={box.xWHi} y1={box.midY} y2={box.midY} className="nia-ppm-whisker"/>
      <line x1={box.xWLo} x2={box.xWLo} y1={box.midY - 10} y2={box.midY + 10} className="nia-ppm-whisker"/>
      <line x1={box.xWHi} x2={box.xWHi} y1={box.midY - 10} y2={box.midY + 10} className="nia-ppm-whisker"/>
      <rect x={Math.min(box.x25, box.x75)} y={box.midY - box.boxH / 2}
        width={Math.max(2, Math.abs(box.x75 - box.x25))} height={box.boxH}
        className="nia-ppm-box" rx={3}/>
      <line x1={box.xMed} x2={box.xMed}
        y1={box.midY - box.boxH / 2 - 2} y2={box.midY + box.boxH / 2 + 2}
        className="nia-ppm-median"/>
      {points.map(pt => {
        const active = hover?.point?.project?.id === pt.project.id || selectedId === pt.project.id;
        return <circle key={pt.project.id}
          cx={pt.x} cy={pt.y}
          r={active ? 6.5 : pt.outlier ? 5 : 4.5}
          className={[
            'nia-ppm-dot nia-ppm-scatter-dot',
            pt.outlier ? 'is-outlier' : '',
            active ? 'is-active' : '',
            selectedId === pt.project.id ? 'is-selected' : '',
          ].filter(Boolean).join(' ')}
          onMouseEnter={e => placeHover(pt, e)}
          onMouseMove={e => placeHover(pt, e)}
          onClick={e => {e.stopPropagation(); onSelect?.(pt.project);}}
          role="button" tabIndex={0}
          onKeyDown={e => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault(); onSelect?.(pt.project);}}}
          aria-label={`${preferredChainageTitle(pt.project)}, ${money(Math.round(pt.rate))} per meter`}>
        </circle>;
      })}
    </svg>
    {hover && <aside className="nia-ppm-hover-card" style={{left: hover.left, top: hover.top}}
      role="status" aria-live="polite">
      <strong className="nia-ppm-hover-title">{preferredChainageTitle(hover.point.project)}</strong>
      <dl className="nia-ppm-hover-dl">
        {hover.point.project.funding_label
          ? <div><dt>Funding</dt><dd>{hover.point.project.funding_label}</dd></div>
          : null}
        <div><dt>₱/m</dt><dd>{money(Math.round(hover.point.rate))}
          {hover.point.outlier ? <span className="nia-ppm-outlier-tag">outlier</span> : null}</dd></div>
        <div><dt>Allocation</dt><dd>{money(hover.point.project.amount_php)}</dd></div>
        <div><dt>Length</dt><dd>{hover.point.project.chainage_length_m == null ? '—'
          : `${hover.point.project.chainage_length_m.toLocaleString('en-PH')} m`
            + (formatLengthKm(hover.point.project.chainage_length_m)
              ? ` (${formatLengthKm(hover.point.project.chainage_length_m)})` : '')}</dd></div>
      </dl>
      <p className="nia-ppm-hover-hint">Click for full project detail</p>
    </aside>}
  </div>;
}

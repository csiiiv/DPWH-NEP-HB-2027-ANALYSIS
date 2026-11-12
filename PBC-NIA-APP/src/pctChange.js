// Shared percent-change helpers (analysis-tabs R44). One formula for every
// workspace: (current − prior) / |prior| × 100; null when inputs are
// null/non-finite or prior === 0. Display: signedPct returns a plain
// string ("—" / "+x.x%" / "−x.x%"); DPWH Analysis wraps the same number
// in colored spans via its local signedPercent.

export const pctChange = (current, prior) =>
  current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior) || prior === 0
    ? null
    : (current - prior) / Math.abs(prior) * 100;

export const signedPct = value =>
  value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

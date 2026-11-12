/** Format attached NEP↔House chainage spans for Compare review. */

const LENGTH_REVIEW_LABELS = {
  repaired_km_ocr: 'length uses repaired km OCR',
  absurd_unresolved: 'absurd span — length omitted',
};

export function totalLengthM(chainages) {
  if (!Array.isArray(chainages) || !chainages.length) return null;
  let sum = 0, any = false;
  for (const c of chainages) {
    if (c?.length_m == null || !Number.isFinite(c.length_m)) continue;
    if (c?.length_review === 'absurd_unresolved') continue;
    sum += c.length_m;
    any = true;
  }
  return any ? sum : null;
}

export function formatChainageSpans(chainages) {
  if (!Array.isArray(chainages) || !chainages.length) return '';
  return chainages.map(c => {
    const from = c?.from || '';
    const to = c?.to || '';
    let span;
    if (c?.point || (from && to && from === to)) span = from || to;
    else if (from && to) span = `${from} – ${to}`;
    else span = from || to || c?.kind || '';
    if (!span) return '';
    if (c?.length_review === 'repaired_km_ocr' && c.length_from && c.length_to) {
      // Show the length interpretation first; keep printed OCR for audit.
      return `${c.length_from} – ${c.length_to} (printed ${span})`;
    }
    if (c?.length_review === 'absurd_unresolved') {
      return `${span} (length omitted)`;
    }
    return span;
  }).filter(Boolean).join(', ');
}

export function chainageLengthReview(chainages) {
  if (!Array.isArray(chainages) || !chainages.length) return null;
  const flags = new Set(chainages.map(c => c?.length_review).filter(Boolean));
  if (flags.has('absurd_unresolved')) return 'absurd_unresolved';
  if (flags.has('repaired_km_ocr')) return 'repaired_km_ocr';
  return null;
}

export function chainageLengthReviewLabel(flag) {
  return LENGTH_REVIEW_LABELS[flag] || null;
}

/** Signed km string for a meter delta, e.g. "+1.20 km" / "−0.06 km". */
export function formatSignedKm(deltaM) {
  if (deltaM == null || !Number.isFinite(deltaM)) return null;
  const km = deltaM / 1000;
  if (km === 0) return '0.00 km';
  const sign = km > 0 ? '+' : '−';
  return `${sign}${Math.abs(km).toFixed(2)} km`;
}

export function formatLengthKm(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Percent length change vs NEP baseline, e.g. −10.8. */
export function chainageLengthPct(deltaM, nepM) {
  if (deltaM == null || nepM == null || !Number.isFinite(deltaM) || !Number.isFinite(nepM) || nepM === 0) {
    return null;
  }
  return (deltaM / Math.abs(nepM)) * 100;
}

export function formatSignedPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct === 0) return '0.0%';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Per-source chainage cell payload (null if that side has no spans).

  Δ is length-only. Single point stations still show the marker; they do not
  get a station-shift Δ Chainage line.
*/
export function chainageSideDetail(side, nepSide = null, {withDelta = false} = {}) {
  const spans = formatChainageSpans(side?.chainages);
  if (!spans) return null;
  const lengthM = totalLengthM(side.chainages);
  const nepM = nepSide ? totalLengthM(nepSide.chainages) : null;
  const lengthReview = chainageLengthReview(side.chainages);
  let deltaM = null;
  let deltaKind = null;
  if (withDelta && lengthM != null && nepM != null) {
    deltaM = lengthM - nepM;
    deltaKind = 'length';
  }
  const pct = withDelta ? chainageLengthPct(deltaM, nepM) : null;
  return {
    spans,
    lengthKm: formatLengthKm(lengthM),
    lengthReview,
    lengthReviewLabel: chainageLengthReviewLabel(lengthReview),
    deltaM,
    deltaKind,
    deltaKm: withDelta ? formatSignedKm(deltaM) : null,
    deltaPct: withDelta ? formatSignedPct(pct) : null,
    direction: deltaM == null ? null : deltaM > 0 ? 'up' : deltaM < 0 ? 'down' : 'same',
  };
}

/** NEP → HGAB chainage summary for a comparison row (null if not usable). */
export function chainageAmendment(row) {
  const house = row?.third || row?.second || row?.house;
  const nep = row?.nep;
  if (!house?.chainages?.length || !nep?.chainages?.length) return null;
  const nepDetail = chainageSideDetail(nep);
  const houseDetail = chainageSideDetail(house, nep, {withDelta: true});
  if (!nepDetail || !houseDetail) return null;
  return {
    nepSpans: nepDetail.spans,
    houseSpans: houseDetail.spans,
    nepLengthKm: nepDetail.lengthKm,
    houseLengthKm: houseDetail.lengthKm,
    deltaM: houseDetail.deltaM,
    deltaKm: houseDetail.deltaKm,
    deltaPct: houseDetail.deltaPct,
    direction: houseDetail.direction,
    lengthReview: houseDetail.lengthReview || nepDetail.lengthReview,
    nep: nepDetail,
    house: houseDetail,
  };
}

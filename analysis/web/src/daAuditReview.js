// Human-review explanations for the audit tags emitted by build_fmr_workbench.py.
// The source data is not modified: each card shows the specific comparison or
// evidence that caused its tag, and preserves the raw code for provenance.
import {daAuditLabel, flagLabel, flagWhy, money, signedMoney} from './fmrModel.js';

const present = value => value == null || value === '' ? 'Not recorded' :
  typeof value === 'object' ? JSON.stringify(value) : String(value);
const field = (label, value) => ({label, value: present(value)});
const coords = project => present(project?.coordinates_raw || project?.coordinates);
const printedName = side => side === 'house' ? 'House GAB' : 'NEP';

export function describeDaAuditFlag(row, code) {
  const match = /^(nep|house)_(.+)$/.exec(code);
  const side = match?.[1] || null;
  const kind = match?.[2] || '';
  const printed = side ? row[side] : null;
  const source = side ? printedName(side) : null;
  const da = row.da || {};
  // The builder compares to the effective/proposed DA observation when one
  // exists, falling back to FROM for a dropped row with no proposal.
  const selected = da.proposed || da.from;
  const basis = da.proposed ? 'DA effective proposal' : 'DA FROM (no proposal)';
  const result = {
    code, side,
    origin: side ? source + ' printed record' : 'DA working-draft remark',
    label: daAuditLabel(code),
    explanation: 'Recorded audit tag. Check the source documents before drawing conclusions.',
    fields: [],
  };
  if (side && kind === 'amount_diff_vs_da') {
    result.label = source + ' amount differs from DA';
    result.explanation = 'The printed allocation differs from the DA comparison allocation. This is a numeric difference, not evidence of an incorrect allocation.';
    result.fields = [
      field(source + ' printed allocation', money(printed?.amount_php)),
      field(basis + ' allocation', money(selected?.amount_php)),
      field('Printed minus DA', printed?.amount_php != null && selected?.amount_php != null
        ? signedMoney(printed.amount_php - selected.amount_php) : 'Not available'),
    ];
  } else if (side && kind === 'title_diff_vs_da') {
    result.label = source + ' title differs from DA';
    result.explanation = 'Normalized project titles are not identical. Retitling, spelling and scope changes can explain a difference; check both recorded titles.';
    result.fields = [
      field(source + ' printed title', printed?.title),
      field(basis + ' title', selected?.title),
    ];
  } else if (side && kind === 'coord_diff_vs_da') {
    result.label = source + ' coordinates differ from DA';
    result.explanation = 'The parsed coordinate sequences differ exactly. This is not a distance or geographic-validity finding. Original text is shown where available.';
    result.fields = [
      field(source + ' printed coordinates', coords(printed)),
      field(basis + ' coordinates', coords(selected)),
    ];
  } else if (side && kind === 'needs_review') {
    result.label = source + ' coordinate review pending';
    result.explanation = 'The printed-source normalization retains an unresolved coordinate issue. This flag is not a direct comparison with the DA draft.';
    result.fields = [
      field('Printed coordinate status', printed?.status),
      field('Remaining review flags', (printed?.review_flags || []).join(', ')),
      field('Printed coordinates', coords(printed)),
    ];
  } else if (side && kind.startsWith('review:')) {
    const reviewCode = kind.slice('review:'.length);
    result.label = source + ': ' + flagLabel(reviewCode);
    result.explanation = flagWhy(reviewCode) + ' This is a printed-source review flag, not a DA discrepancy.';
    result.fields = [
      field('Review flag code', reviewCode),
      field('Printed coordinate status', printed?.status),
      field('Printed coordinates', coords(printed)),
    ];
  } else if (side && kind.startsWith('psgc:')) {
    const verdict = kind.slice('psgc:'.length);
    const mapped = (printed?.psgc || []).map(point => point.where || point.note).filter(Boolean);
    result.label = source + ' title/location conflict (' + verdict + ')';
    result.explanation = 'The printed-source title/locality and PSGC-geocoded point evidence have a disagreement or no match. This is not a direct DA-versus-printed comparison.';
    result.fields = [
      field('Printed title', printed?.title),
      field('PSGC verdict', printed?.location_agreement || verdict),
      field('Printed coordinates', coords(printed)),
      field('Geocoded point localities', mapped.join('; ')),
    ];
  } else if (code.startsWith('da_remark_')) {
    const title = code === 'da_remark_reprioritized' ? 'Reprioritization mentioned in DA remarks'
      : code === 'da_remark_title_and_coordinates' ? 'DA remark mentions title and coordinates'
      : code === 'da_remark_coordinates' ? 'DA remark mentions coordinates'
      : code === 'da_remark_title' ? 'DA remark mentions a title' : daAuditLabel(code);
    result.label = title;
    result.explanation = 'This is a keyword classification of a DA draft remark, not an independently verified anomaly. Inspect the actual remarks and Excel row.';
    result.fields = [
      field('DA remark', selected?.remarks || da.from?.remarks),
      field('DA FROM title', da.from?.title),
      field('DA effective title', selected?.title),
      ...((code.includes('coordinates') || code.includes('title_and_coordinates'))
        ? [field('DA FROM coordinates', coords(da.from)), field('DA effective coordinates', coords(selected))]
        : []),
      ...(code === 'da_remark_reprioritized'
        ? [field('DA FROM allocation', money(da.from?.amount_php)), field('DA effective allocation', money(selected?.amount_php))]
        : []),
    ];
  } else {
    result.fields = [field('Raw audit code', code),
      field('DA comparison basis', basis),
      field('DA control number', selected?.control_no)];
  }
  return result;
}

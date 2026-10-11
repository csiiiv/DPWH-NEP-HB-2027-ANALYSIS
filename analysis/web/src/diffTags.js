/** Shared display labels for fuzzy title-difference tags (see normalize_labels.diff_tags). */
export const DIFF_TAG_LABELS={
  work_type_change:'Work type',
  stage_qualifier:'Stage qualifier',
  work_phrase_modifier:'Work phrase/along',
  connector_word:'at/in phrasing',
  city_suffix:'City suffix',
  facility_qualifier:'Facility qualifier',
  unit_count:'Unit/phase count',
  chainage_digit:'Chainage digits',
  structure_id_digit:'ID/coordinate digits',
  same_gps_coordinates:'Same GPS coordinates',
  different_gps_coordinates:'Different GPS coordinates',
  parenthetical_modifier:'Parenthetical only',
  location_subname:'Different sub-name',
  spelling_ocr:'Spelling/OCR',
  other_place_or_word:'Different place/word',
  identical:'Identical tokens',
};

/** Plain-language review descriptions for the analytics info popovers. */
export const DIFF_TAG_DESCRIPTIONS={
  work_type_change:'The two titles name different work types — construction versus rehabilitation, for example. Review whether the same site was re-scoped or these are separate projects.',
  stage_qualifier:'The titles differ only in a completion stage qualifier such as Construction (Completion) versus Construction — usually the same line item printed differently by each source.',
  work_phrase_modifier:'One title prefixes a work phrase such as Preventive Maintenance along before the same road name. The phrasing differs but the road segment is shared.',
  connector_word:'The titles differ by small connecting words (at, in) or comma phrasing around an otherwise shared place name — a typographical rather than location difference.',
  city_suffix:'One title appends City to an otherwise identical place name, such as Manila versus Manila City. Treat as the same locality unless evidence says otherwise.',
  facility_qualifier:'One title qualifies the facility — Gym, Gymnasium, Covered Court — while the rest of the name matches. Check the source PDF for the exact facility scope.',
  unit_count:'One title carries a unit, phase or purok count the other omits, like 2 units or Phase 2. Confirm scope against both printed sources.',
  chainage_digit:'Road-station digits differ between the titles (K-post or Sta. values) on the same road name. Check whether the project length was re-surveyed or re-segmented.',
  structure_id_digit:'A structure or bridge ID digit differs, for example B00422CB. Confirm the correct structure ID in the source PDFs before pairing.',
  same_gps_coordinates:'Both titles carry decimal coordinates that agree to about four decimals (roughly ten metres) despite wording differences — strong evidence of the same site.',
  different_gps_coordinates:'Both titles carry decimal coordinates, but the points differ — likely genuinely different sites rather than a wording slip.',
  parenthetical_modifier:'The titles are identical outside parentheses; a parenthetical such as (Phase 2) or (Covered Court) was added or changed. Decide whether scope changed with it.',
  location_subname:'The municipality or province tail matches, but the barangay, street or earlier location segment differs — a nearby but different place. Verify both addresses.',
  spelling_ocr:'A single shared token differs in a way consistent with a spelling or OCR slip; verify against the source PDF before promoting a normalize rule.',
  other_place_or_word:'The residual difference does not fit a known category. Manual review against both source PDFs is needed before pairing or splitting.',
  identical:'The titles normalize to the same token sequence, so any remaining difference is purely typographical.',
};

/** [label, description] pairs for the analytics Status/Counts components. */
export const DIFF_TAG_INFO=Object.fromEntries(
  Object.entries(DIFF_TAG_LABELS).map(([key,label])=>[key,[label,DIFF_TAG_DESCRIPTIONS[key]]]));

export const diffTagLabel=tag=>DIFF_TAG_LABELS[tag]||tag;

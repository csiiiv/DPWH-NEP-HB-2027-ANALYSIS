/** Shared display labels for fuzzy title-difference tags (see normalize_labels.diff_tags). */
export const DIFF_TAG_LABELS={
  work_type_change:'Work type',
  stage_qualifier:'Stage qualifier',
  connector_word:'at/in phrasing',
  city_suffix:'City suffix',
  facility_qualifier:'Facility qualifier',
  unit_count:'Unit/phase count',
  chainage_digit:'Chainage digits',
  structure_id_digit:'ID/coordinate digits',
  spelling_ocr:'Spelling/OCR',
  other_place_or_word:'Different place/word',
  identical:'Identical tokens',
};

export const diffTagLabel=tag=>DIFF_TAG_LABELS[tag]||tag;

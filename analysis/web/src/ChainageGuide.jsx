/** Concept guide for the Chainage analysis.
 *
 * Every metric the view shows, defined once in plain language with worked
 * numbers. GUIDE_CONCEPTS also powers the inline "i" explainers (short) and
 * the dotted-underline term tooltips used across Analysis.jsx. */
import React from 'react';
import {CHAINAGE_MODUS, MODUS_DEADBAND} from './chainageAnalysis.js';

export const GUIDE_CONCEPTS = [
  {
    key: 'chainage',
    term: 'Chainage · stations · spans',
    short: 'Distance along a road from a fixed start, written K0017+670; a span’s length is the difference between its end stations, and a project’s length is the sum of its spans.',
    body: <>
      <p>Road engineers measure distance along a road from a fixed starting point (kilometre zero) — the <strong>chainage</strong>, also called stationing. A span is written <code>K0017+670 – K0017+800</code>: kilometre 17, metre 670 to metre 800 — 130&nbsp;m of road.</p>
      <p>A project’s <strong>chainage length</strong> is the sum of its spans. Single points like <code>K0003+230</code> mark a location and carry no length. Station text survives OCR and retyping badly, so spans are repaired before use: artifacts like <code>K0003 + 230</code> are normalised, and spans that stay absurd after repair (a jump implying 199&nbsp;km of works, say) are flagged rather than silently trusted — those are the <em>length review</em> marks in the records stage.</p>
    </>,
  },
  {
    key: 'perKm',
    term: 'Price per km (₱/km)',
    short: 'Allocation ÷ chainage length in km — comparable across projects and readings, but a review lens, not a certified unit cost.',
    body: <>
      <p>Allocation divided by chainage length in kilometres: what the budget pays per kilometre of listed road. It is comparable across projects and across readings, which is why it drives this view — both the Δ columns (did this pair’s rate move?) and the peer benchmark (is this rate plausible?).</p>
      <p>Caveats keep it a <strong>review lens, not a unit-cost finding</strong>: an allocation can cover works beyond the listed spans (drainage, shoulders, safety), bundle several road items, and NEP vs House amounts sit on different bases — GAA-like versus full project cost, especially for foreign-assisted projects.</p>
    </>,
  },
  {
    key: 'redFlag',
    term: 'Price/km red flag',
    short: 'A matched pair whose ₱/km moved more than ±10% between NEP and the House reading. It selects records to pull; it concludes nothing.',
    body: <>
      <p>A pair whose ₱/km changed by more than ±10% between the NEP and the House reading. Movement that large usually has an innocent cause somewhere — span typos, OCR damage, scope reshuffled between line items — but it is exactly where a padded rate would hide, so the flag gathers the records worth pulling.</p>
      <p>A red flag is a selection criterion, not a finding.</p>
    </>,
  },
  {
    key: 'modus',
    term: 'Modus · amendment archetype',
    short: 'The archetype a pair falls into from the up/held/down direction of its budget, scope and rate deltas; the identity (1+budget)=(1+scope)×(1+rate) ties the three together.',
    body: <>
      <p>Short for <em>modus operandi</em>. Each measurable pair is classified by three deltas — <strong>budget</strong> (allocation Δ), <strong>scope</strong> (chainage length Δ), <strong>rate</strong> (₱/km Δ) — each read as up / held / down against the ±{MODUS_DEADBAND}% deadband. The combination names the archetype: <em>budget held · scope cut · rate marked up</em> is the same money buying less road at a higher price.</p>
      <p>The three axes are tied by an exact identity, <code>(1 + budget) = (1 + scope) × (1 + rate)</code>, so they can never move independently — the archetype simply names which lever moved. Flat budget with scope −45% forces rate ≈ +82%.</p>
    </>,
  },
  {
    key: 'deadband',
    term: 'Deadband',
    short: 'The ±10% no-change band on each modus axis; moves inside it count as held so rounding wiggles do not generate archetypes.',
    body: <>
      <p>Each modus axis treats changes within ±{MODUS_DEADBAND}% as <em>held</em>. Without the band, every rounding wiggle and minor re-measurement would spawn an archetype. It is a triage threshold, not a legal one — a +9.8% rate lift is not innocent, it is simply not this tool’s loudest signal.</p>
    </>,
  },
  {
    key: 'median',
    term: 'Median',
    short: 'The middle value — half the records above, half below. One absurd value barely moves it, unlike an average.',
    body: <>
      <p>The middle value of a group: half the records sit above it, half below. Used everywhere instead of the average because one absurd ₱/km — a typo adding a zero — drags an average far off while barely moving a median.</p>
      <p>“Median Δ” in the amendment-patterns table is the middle change among the records inside that archetype: half of them changed more, half less.</p>
    </>,
  },
  {
    key: 'mad',
    term: 'MAD · median absolute deviation',
    short: 'The typical distance between a cohort’s values and their median: the median of |value − median|. ×1.4826 ≈ standard deviation.',
    body: <>
      <p>The typical spread of a cohort around its middle: take every value’s distance from the median, then take the median of those distances.</p>
      <p>Worked example — cohort ₱/km of 10, 12, 14, 16, 18&nbsp;M has median 14&nbsp;M; the absolute deviations are 4, 2, 0, 2, 4&nbsp;M; MAD = 2&nbsp;M. Multiplied by 1.4826 it estimates the standard deviation clean data would have, while shrugging off outliers the way a plain average cannot.</p>
    </>,
  },
  {
    key: 'robustZ',
    term: 'Robust z',
    short: '(₱/km − cohort median) ÷ (1.4826 × MAD): distance from the peer middle in typical-spread units. |z| ≥ 2 unusual, ≥ 3 outlier.',
    body: <>
      <p>A project’s distance from its cohort’s middle, measured in spreads: <code>(₱/km − median) ÷ (1.4826 × MAD)</code>.</p>
      <p>In the MAD example above, a project at ₱60&nbsp;M/km scores (60 − 14) ÷ (1.4826 × 2) ≈ <strong>+15.5</strong> — fifteen typical spreads above its peers, while the cohort median itself stays untouched. As a rule of thumb: |z| under 2 is ordinary, ≥ 2 unusual, ≥ 3 (marked red) a genuine outlier for its peers.</p>
      <p>A robust z is a question — <em>why is this district’s price high?</em> — never an answer.</p>
    </>,
  },
  {
    key: 'cohort',
    term: 'Peer cohort',
    short: 'The comparison group for the benchmark: same program, same zone, and either the same region or the same DEO — at least 5 measurable peers.',
    body: <>
      <p>The peer group each project is benchmarked against: same program, same zone (foreign-assisted and local projects price differently), and — per the toggle above the cohort table — either the same <strong>region</strong> or the same <strong>district engineering office</strong>.</p>
      <p>Cohorts need at least 5 measurable peers; smaller groups would make the median and MAD noise, so they are dropped (their units then also disappear from the outlier table). The P25–P75 columns bracket the middle half of peers — the band a typical ₱/km lands in.</p>
    </>,
  },
  {
    key: 'deo',
    term: 'DEO · district engineering office',
    short: 'The DPWH district implementing local projects. DEO cohorts compare a ₱/km against its own district’s norm; region cohorts pool every district in the region.',
    body: <>
      <p>The DPWH district engineering office that implements — and in practice prices — local projects. The benchmark axis chooses the peer set:</p>
      <p><strong>Region</strong> pools every office in a region; broad but forgiving. <strong>DEO</strong> compares a project only against its own district; sharper, since terrain, contracting customs and typical works differ by district. A ₱/km that is normal for one DEO can be an outlier for its neighbour — when a regional outlier looks locally normal (or the reverse), flip the axis.</p>
      <p>Records with no recorded office fall back to a per-region “no recorded office” cohort under the DEO axis.</p>
    </>,
  },
];

export function Term({k, children}) {
  const concept = GUIDE_CONCEPTS.find(c => c.key === k);
  if (!concept) return children ?? k;
  return <span className="term" title={concept.short}>{children ?? concept.term}</span>;
}

export default function ChainageGuide({open = false, title = 'Guide · every term this view uses'}) {
  return <details className="chainage-guide" open={open}>
    <summary>{title}<small>chainage &amp; spans · ₱/km · amendment archetypes · peer cohorts · median · MAD · robust z</small></summary>
    <div className="guide-grid">
      {GUIDE_CONCEPTS.map(concept => <article key={concept.key} className="guide-card">
        <h4>{concept.term}</h4>
        {concept.body}
      </article>)}
    </div>
    <h4 className="guide-archetypes-title">Amendment archetypes · budget × scope × rate</h4>
    <p className="muted">Every measurable pair lands in exactly one archetype, named for the direction trio [budget, scope, rate] after the ±{MODUS_DEADBAND}% deadband. Rate-marked-up archetypes read red, rate-cut read blue, neutral stay slate — the same colors used on the pills in the records stage.</p>
    <div className="guide-archetypes">
      {Object.entries(CHAINAGE_MODUS).map(([key, modus]) =>
        <p key={key}><span className="modus-pill" data-modus={key}>{modus.label}</span><span>{modus.hint}</span></p>)}
    </div>
  </details>;
}

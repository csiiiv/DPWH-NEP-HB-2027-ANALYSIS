// The #congress workspace: one card per district engineering office group, and
// a project explorer for the rows that card pins.
//
// Two payloads, loaded separately on purpose. The district index (~1 MB) is
// committed and carries every card figure plus the row IDs each bucket holds,
// so the card grid renders without the 50 MB comparison payload. Opening a
// district then fetches the shared comparison payload and filters it by those
// pinned IDs — the explorer can never disagree with the card it came from,
// because it is reading the same rows the published Overview reads.
//
// Attribution is bounded: a card reports what the office serving that district
// printed. Nothing here establishes that a representative requested, sponsored
// or controlled any project. Tier B figures are undivided ranges, never split.
import React, {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import WorkbenchHeader from './WorkbenchHeader.jsx';
import SortableTable from './SortableTable.jsx';
import ShareLink from './ShareLink.jsx';
import {openModalDialog} from './modalLifecycle.js';
import {readRoute, routeHref} from './routes.js';
import {loadData, siteUrl, sourceReference, repo} from './data.js';
import {useDebouncedSearch} from './useDebouncedSearch.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';
import {formatSignedKm, formatLengthKm, chainageLengthReviewLabel} from './chainageDisplay.js';
import {regionName} from './regionNames.js';
import {buildFmrRedFlags} from './fmrRedFlags.js';
import {
  BUCKET_LABELS, TIER_LABELS, TIER_SHORT,
  LOCATION_TIER_LABELS, LOCATION_TIER_SHORT, LOCATION_TIER_FILTER, LOCATION_FLAG_LABELS,
  FMR_TIER_LABELS, FMR_TIER_SHORT, FMR_TIER_FILTER, FMR_FLAG_LABELS,
  CARD_SORT_OPTIONS, parseCardSort, cardSortParams,
  money, moneyCompact, signedMoney, percent,
  cardHeadline, bucketTotals, districtSeats, representativeLabel, deoCardLabel, districtHeading, leadershipRoles,
  cardCarriesMoney, sortedCards, indexRowsById, cardRows,
  explorerRow, EXPLORER_COLUMNS, flagCensus, bucketCensus, filterExplorerRows,
  residualPanel, officeChangePanel, datasetOptions, lensPanel, congressRows,
  locationCards, cardLocationFlags, summaryTotals, fmrRows, fmrExplorerRow,
} from './congressModel.js';
import './Fmr.css';
import './Congress.css';
import {downloadExplorer} from './explorerExport.js';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const CongressMap = lazy(() => import('./CongressMap.jsx'));
const FmrSegmentModal = lazy(() => import('./FmrSegmentModal.jsx'));
const FmrDistrictSegmentsModal = lazy(() => import('./FmrDistrictSegmentsModal.jsx'));
const FMR_BUCKET_LABELS = {
  insertions: 'House only', deletions: 'NEP only', increased: 'Increases',
  reduced: 'Decreases', unchanged: 'Unchanged pairs', scope_review: 'Scope review',
};

const href = (key, params = {}) => routeHref(key, params, 'congress');
const paramsOf = route => Object.fromEntries(route.params);
function navigate(route, patch) {
  const next = {...paramsOf(route), ...patch};
  for (const key of Object.keys(next)) if (next[key] == null || next[key] === '') delete next[key];
  window.location.hash = href(route.key, next);
}

function Dialog({label, onClose, className = '', children}) {
  const ref = useRef(null);
  useEffect(() => openModalDialog(ref.current), []);
  return <dialog ref={ref} className={`fmr-dialog ${className}`} aria-label={label}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="fmr-dialog-heading"><h2>{label}</h2>
      <button type="button" onClick={onClose}>Close</button></div>
    {children}</dialog>;
}

function TierBadge({tier}) {
  return <span className={`congress-tier tier-${tier}`} title={TIER_LABELS[tier]}>
    {TIER_SHORT[tier]}</span>;
}

/** Location-chain tier badge. Every location card carries `location_tier`;
 * the DEO badge stays for fallback cards whose tier is borrowed from DEO. */
function LocationTierBadge({card}) {
  const key = card.location_tier;
  const labels = {...LOCATION_TIER_LABELS, ...FMR_TIER_LABELS};
  const short = {...LOCATION_TIER_SHORT, ...FMR_TIER_SHORT};
  if (!key || !(key in labels)) return null;
  return <span className={`congress-tier tier-${card.tier} location-tier`} title={labels[key]}>
    {short[key]}</span>;
}

/** Disagreement badges: office↔location mismatch or title/GPS conflict. */
function LocationFlagBadges({flags}) {
  if (!flags?.length) return null;
  const labels = {...LOCATION_FLAG_LABELS, ...FMR_FLAG_LABELS};
  return flags.map(flag => <span key={flag} className="fmr-badge review" title={labels[flag] ?? flag}>
    {labels[flag]?.split(' (')[0] ?? flag}</span>);
}

function LeadershipBadge({roles}) {
  if (!roles.length) return null;
  return <span className="congress-leadership" title="Leadership role recorded by the official roster">
    {roles.map(entry => entry.role).join(' · ')}</span>;
}

/**
 * Portrait from the official roster, resized to WebP at build time.
 * The WebP set is generated by scripts/build_congress_portraits.py into
 * analysis/data/congress_portraits/, which is already served in dev and already
 * packaged, so no extra asset route is needed. A missing or failed portrait
 * renders nothing rather than a broken image.
 */
function Portrait({seat, size = 96}) {
  if (!seat.photoPath || !seat.representative) {
    return <span className="congress-portrait-empty" aria-hidden="true" />;
  }
  const slug = seat.photoPath.split('/').pop().replace(/\.jpg$/i, '');
  // width/height match the CSS box so the browser reserves layout space before
  // the lazy load; the 2x encode keeps it sharp.
  return <img className="congress-portrait" loading="lazy" width={size * 2} height={(size * 5 / 4) * 2}
    src={siteUrl(`analysis/congress_portraits/${slug}.webp`)}
    alt="" aria-hidden="true"
    onError={event => {event.currentTarget.style.display = 'none';}} />;
}

/** Compact profile tiles for undivided-range cards — rendered directly so
 * CSS never overrides the portrait dimensions. */
function ProfileTiles({seats}) {
  if (!seats || seats.length <= 1) {
    const first = seats?.[0];
    return first ? <Portrait seat={first} /> : null;
  }
  const maxVisible = 5;
  return (
    <div className="congress-profile-tiles"
         title={seats.map(s => s.representative).join(' · ')}>
      {seats.slice(0, maxVisible).map(seat => {
        if (!seat.photoPath || !seat.representative) return null;
        const slug = seat.photoPath.split('/').pop().replace(/\.jpg$/i, '');
        return <img key={seat.id}
          src={siteUrl(`analysis/congress_portraits/${slug}.webp`)}
          alt="" aria-hidden="true" width="64" height="85" loading="lazy"
          style={{ width: 64, height: 85, objectFit: 'cover', objectPosition: 'top', borderRadius: 4, border: '1px solid #d9e2ed', background: '#eef3f9' }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />;
      })}
      {seats.length > maxVisible && (
        <span style={{ gridColumn: 'span 2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 132, height: 85, borderRadius: 4, border: '1px solid #d9e2ed', background: '#eef3f9', color: '#516780', fontSize: 12, fontWeight: 600, boxSizing: 'border-box' }}
              title={`+${seats.length - maxVisible} more`}>+{seats.length - maxVisible}</span>
      )}
    </div>
  );
}

function Stat({label, value, detail, className = ''}) {
  return <div className={`fmr-stat ${className}`}><span>{label}</span>
    <strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

/**
 * One card-face line: "N projects worth ₱X". Paired buckets show the movement
 * plus both stages' bases, so a reader can see what the delta was measured
 * against instead of taking a signed number on faith.
 */
function BucketLine({label, count, amount, basis, house, nep, side, muted}) {
  if (!count) {
    return <li className={`congress-bucket empty ${muted ? 'is-muted' : ''}`}>
      <span className="congress-bucket-label">{label}</span>
      <span className="congress-bucket-value">—</span></li>;
  }
  return <li className={`congress-bucket ${muted ? 'is-muted' : ''}`}>
    <span className="congress-bucket-label" title={basis}>{label}</span>
    <span className="congress-bucket-value">
      <strong>{count.toLocaleString('en-PH')}</strong>{' '}
      {count === 1 ? 'project' : 'projects'} worth <strong>{moneyCompact(amount)}</strong>
      {side && <small className="congress-bucket-side">on the {side === 'house' ? 'HGAB3' : 'NEP'} side</small>}
      {house != null && nep != null &&
        <small className="congress-bucket-side">NEP {moneyCompact(nep)} → HGAB3 {moneyCompact(house)}</small>}
    </span></li>;
}

function DistrictCard({card, onOpen, rowFlags = null}) {
  const headline = cardHeadline(card);
  const rep = representativeLabel(card);
  const deoLabel = card.location_tier ? null : deoCardLabel(card);
  const seats = districtSeats(card);
  const roles = leadershipRoles(card);
  const carries = cardCarriesMoney(card);
  const first = seats[0];
  const flags = rowFlags ? cardLocationFlags(card, rowFlags) : [];
  const isFmr = card.id.startsWith('fmr:');
  // Legislative lenses (location, FMR) answer "where did money land by
  // district", so the district leads and the representative follows. The DEO
  // lens keeps its office-name heading. Catch-all cards never get a district
  // heading — money is not dressed up as a district.
  const legislative = districtHeading(card);

  return <article className={`congress-card tier-${card.tier}${carries ? '' : ' no-money'}`}>
    <header className="congress-card-head">
      {/* Region catch-all cards have no seat, so no portrait either — the
          empty slot keeps the grid aligned without dressing money up as a
          district. */}
      {seats.length > 1 ? <ProfileTiles seats={seats} /> : first ? <Portrait seat={first} /> : <span className="congress-portrait-empty" aria-hidden="true" />}
      <div className="congress-card-title">
        <p className="congress-district">{legislative
          ? (isFmr ? 'FMR legislative district' : 'Legislative district')
          : seats.length
            ? seats.map(seat => seat.districtName).join(' · ')
            : card.location_tier === 'deo' ? 'District Engineering Office'
            : card.location_tier === 'unassigned' ? 'Unassigned catch-all'
            : 'Region catch-all'}</p>
        <h3>
          <button type="button" className="congress-card-open" onClick={onOpen}
            title={carries ? 'Explore the projects on this card' : 'Read why this card shows no attributed amount'}>
            {/* A region catch-all has no seat; its heading is the region —
                emphasized like a district card's representative name — with
                "Region catch-all" demoted to the subheader above, so money is
                never dressed up as a district. Cards in the DEO lens lead
                with the office name; representatives remain in the seat list. */}
            {legislative?.heading
              ?? (card.location_tier === 'deo' && card.card_label
                ? card.card_label
                : (deoLabel ?? (seats.length || !card.card_label ? rep.text
                  : card.location_tier === 'region' ? regionName(card.card_label) : card.card_label)))}
          </button>
        </h3>
        <p className="congress-badges">
          {card.location_tier ? <LocationTierBadge card={card} /> : <TierBadge tier={card.tier} />}
          <LeadershipBadge roles={roles} />
          <LocationFlagBadges flags={flags} />
        </p>
        {legislative?.sub && <p className="congress-card-sub">{legislative.sub}</p>}
      </div>
    </header>

    {/* Seats list for district cards (single rep or multi-rep ranges). Region
        catch-alls and DEO-grouped undivided cards render their own content
        below — the catch-all line for regions, the DEO name as heading. */}
    {card.location_tier === 'deo' ? null :
     seats.length ? <ul className="congress-seats">
       {seats.map(seat => <li key={seat.id}>
         <span className="congress-seat-district" title={seat.officialSeat}>{seat.label}</span>
         {seat.ambiguous
           ? <span className="congress-seat-ambiguous" title={seat.note}>
               seat not resolved — {seat.candidates.join(' / ')}</span>
           : <span className="congress-seat-rep">{seat.representative}
               {seat.leadershipRoles.length > 0 &&
                 <span className="congress-leadership">{seat.leadershipRoles.join(' · ')}</span>}
               {seat.detailUrl && <a href={seat.detailUrl} target="_blank" rel="noreferrer"
                 title="Official roster entry on congress.gov.ph">↗</a>}</span>}
       </li>)}
     </ul> : <p className="congress-seats congress-catchall-line">{card.tier_note}</p>}

    {/* DEO-grouped undivided card: show the constituent DEOs under the heading. */}
    {card.location_tier === 'deo' && card.offices?.length > 0 &&
      <ul className="congress-deo-list">
        {card.offices.map(o =>
          <li key={o.id}><span className="congress-deo-name">{o.name}</span>{o.type !== 'district_engineering_office' && <span className="congress-deo-type">{o.type}</span>}</li>
        )}
      </ul>}

    {/* The implementing offices the budget documents print for this card's
        rows. Context the documents assert, never a site claim — and the
        search hook for finding a district by its DEO. */}
    {card.ledger_names?.length > 0 &&
      <p className="congress-card-offices" title={card.ledger_names.join(' · ')}>
        DEO: {card.ledger_names.join(' · ')}</p>}

    {carries ? <>
      <ul className="congress-buckets">
        <BucketLine label={isFmr ? 'House only' : 'Unsupported insertions'} count={headline.insertions.count}
          amount={headline.insertions.amount_php} side="house"
          basis="House rows with no attached NEP record. Not confirmed unsupported insertions." />
        <BucketLine label={isFmr ? 'NEP only' : 'Deletions'} count={headline.deletions.count}
          amount={headline.deletions.amount_php} side="nep"
          basis="NEP rows with no attached House reading. Not confirmed deletions." />
        <BucketLine label="Increases" count={headline.increased.count}
          amount={headline.increased.amount_php} house={headline.increased.house_php}
          nep={headline.increased.nep_php} basis="Paired rows where HGAB3 exceeds the NEP." />
        <BucketLine label="Decreases" count={headline.reduced.count}
          amount={headline.reduced.amount_php} house={headline.reduced.house_php}
          nep={headline.reduced.nep_php} basis="Paired rows where HGAB3 is below the NEP." />
        <BucketLine label="Unchanged" count={headline.unchanged.count}
          amount={headline.unchanged.amount_php} muted
          basis="Paired rows whose recorded allocations are equal on both stages." />
        {headline.scope_review.count > 0 &&
          <BucketLine label="Scope review" count={headline.scope_review.count}
            amount={headline.scope_review.house_php} muted
            basis="Same-road pairs with non-overlapping station spans. Deltas are deliberately not booked as adjustments." />}
      </ul>
      <footer className="congress-card-foot">
        <Stat label="Total NEP" value={moneyCompact(headline.nep.amount_php)}
          detail={`${headline.nep.count.toLocaleString('en-PH')} records`} />
        <Stat label="Total HGAB" value={moneyCompact(headline.house.amount_php)}
          detail={`${headline.house.count.toLocaleString('en-PH')} records`} />
        <button type="button" className="congress-explore" onClick={onOpen}>
          Explore {card.rows.toLocaleString('en-PH')} projects →</button>
      </footer>
    </> : <div className="congress-no-money">
      <p>{card.tier_note}</p>
      <Stat label="Attributed here" value="₱0" detail="0 records" className="zero" />
      <button type="button" className="congress-explore" onClick={onOpen}>Read the explanation →</button>
    </div>}
  </article>;
}

/** FY2027 allocation summary for the filtered card set, as a table: one row
 * per card — district, representative, NEP, amended HGAB3 reading, and the
 * signed increase — then a TOTAL row and the three headline tiles. Figures
 * come straight from the card summaries and `summaryTotals()`, so the table
 * cannot disagree with the grid it summarizes. Undivided ranges and
 * multi-district DEOs stay whole on their row, never split. */
export function SearchSummary({cards, query = '', lensLabel, onClose}) {
  const totals = summaryTotals(cards);
  const deltaClass = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
  const netShare = totals.nep.amount_php ? totals.delta_php / totals.nep.amount_php : null;
  return <Dialog label={`FY 2027 allocations · ${lensLabel}`} className="congress-summary"
    onClose={onClose}>
    <p className="fmr-muted">
      {query.trim() ? <>Matching <strong>“{query.trim()}”</strong> · </> : null}
      <strong>{totals.cards.toLocaleString('en-PH')}</strong> cards holding
      {' '}<strong>{totals.rows.toLocaleString('en-PH')}</strong> ledger records, one row per card in
      the grid’s order. Undivided ranges and multi-district offices stay whole on their row, never
      split. Increase = HGAB3 − NEP; a negative value means the amended reading is below the NEP.</p>
    <table className="congress-record-table congress-summary-table">
      <caption>Per-card allocations with totals</caption>
      <thead><tr>
        <th scope="col">District / City</th><th scope="col">Representative</th>
        <th scope="col">NEP</th><th scope="col">Amended (HGAB3)</th>
        <th scope="col">Increase</th></tr></thead>
      <tbody>{cards.map(card => {
        const seats = districtSeats(card);
        const name = card.location_tier === 'deo' && card.card_label
          ? card.card_label
          : card.location_tier === 'region' ? regionName(card.card_label)
          : seats.length ? seats.map(seat => seat.districtName).join(' · ')
          : card.card_label ?? card.id;
        return <tr key={card.id}>
          <th scope="row">{name}</th>
          <td>{seats.length ? representativeLabel(card).text : '—'}</td>
          <td className="num">{moneyCompact(card.summary.sources.nep.amount_php)}</td>
          <td className="num">{moneyCompact(card.summary.sources.house.amount_php)}</td>
          <td className={`num ${deltaClass(card.summary.delta_php)}`}>
            {signedMoney(card.summary.delta_php)}</td>
        </tr>;})}
      </tbody>
      <tfoot><tr>
        <th scope="row">Total · {totals.cards.toLocaleString('en-PH')} cards</th>
        <td>{totals.rows.toLocaleString('en-PH')} records</td>
        <td className="num">{moneyCompact(totals.nep.amount_php)}</td>
        <td className="num">{moneyCompact(totals.house.amount_php)}</td>
        <td className={`num ${deltaClass(totals.delta_php)}`}>{signedMoney(totals.delta_php)}</td>
      </tr></tfoot>
    </table>
    <div className="fmr-stats congress-summary-tiles">
      <Stat label="Original NEP" value={moneyCompact(totals.nep.amount_php)}
        detail={`${totals.nep.count.toLocaleString('en-PH')} records`} />
      <Stat label="Amended (HGAB3)" value={moneyCompact(totals.house.amount_php)}
        detail={`${totals.house.count.toLocaleString('en-PH')} records`} />
      <Stat label="Net increase" value={signedMoney(totals.delta_php)}
        detail={netShare == null ? '—'
          : `${netShare >= 0 ? '+' : '−'}${percent(Math.abs(netShare))} of the NEP`} />
    </div>
    <p className="congress-summary-note">{totals.ties
      ? 'Totals are exact sums of the cards above.'
      : 'Does not tie out — do not publish.'}</p>
  </Dialog>;
}

/** The card grid. Loads from the index alone — no 50 MB payload.
 * `lens` selects which index: 'deo' (office groups) or 'location' (project
 * location). The location index supplies its own hero copy, tier vocabulary
 * and row flags; the card face and explorer are shared. */
export function Districts({index, route, lens = 'deo', locationIndex = null, fmrIndex = null}) {
  // Filters live in the URL, not in state, so a filtered grid is shareable and
  // a copied link restores the exact view (same convention as the FMR tabs).
  const params = paramsOf(route);
  const query = params.q ?? '';
  const tier = params.tier ?? '';
  const sortState = parseCardSort(params.sort, params.dir);
  const sortKind = CARD_SORT_OPTIONS.find(option => option.key === sortState.key)?.kind ?? 'amount';
  const sortIsNameOnly = sortKind === 'name';
  const [showPanels, setShowPanels] = useState(false);
  // The summary modal rides as ?summary=1 rather than local state: filters are
  // URL state, so the summary they scope must be too — a shared link reopens
  // the grid with the modal open over the same filtered set.
  const showSummary = params.summary === '1';
  const setFilter = patch => navigate(route, patch);
  const setSort = next => navigate(route, cardSortParams(next) ?? {sort: null, dir: null});
  // Search is debounced: the URL (and the heavy card re-filter behind it)
  // only updates after typing pauses, not on every keystroke.
  const [searchDraft, setSearchDraft] = useDebouncedSearch(query, q => setFilter({q}), route.key, undefined, 500);

  const isLocation = lens === 'location' && locationIndex;
  const isFmr = lens === 'fmr' && fmrIndex;
  const isLegislative = isLocation || isFmr;
  const activeIndex = isFmr ? fmrIndex : isLocation ? locationIndex : index;
  const lensInfo = lensPanel(activeIndex);
  const residual = residualPanel(index);
  const change = officeChangePanel(index);
  const rowFlags = isLegislative ? activeIndex.row_flags ?? {} : {};

  const allCards = useMemo(() => isLegislative ? locationCards(activeIndex) : index.cards,
    [isLegislative, activeIndex, index]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = allCards.filter(card => {
      if (isLegislative ? (tier && card.location_tier !== tier)
                     : (tier && card.tier !== tier)) return false;
      if (!needle) return true;
      const seats = districtSeats(card);
      return seats.some(seat => [seat.districtName, seat.representative, seat.jurisdiction,
        seat.officialSeat, ...seat.candidates].some(value => value && String(value).toLowerCase().includes(needle))) ||
        card.ledger_names.some(name => name.toLowerCase().includes(needle)) ||
        card.card_label?.toLowerCase().includes(needle);
    });
    // sortedCards must receive the parsed key AND direction — calling it bare
    // silently degrades every option to the HGAB3-descending default.
    return sortedCards(filtered, sortState);
  }, [allCards, isLegislative, query, tier, sortState]);

  const counts = index.counts;
  const locationCounts = isLocation ? locationIndex.counts : null;
  const fmrCounts = isFmr ? fmrIndex.counts : null;
  return <>
    <section className="hero hero-compact">
      <p className="fmr-eyebrow">FY2027 · Congress</p>
      {isFmr ? <>
        <h1>Farm-to-market roads by legislative district</h1>
        <p>The FMR lens resolves each House/NEP comparison row independently from its title PSGC and
          accepted coordinate evidence, then maps clean results through PSGC2LEG. It places
          {' '}{fmrCounts.district_rows.toLocaleString('en-PH')} of {fmrCounts.rows.toLocaleString('en-PH')}
          {' '}rows on legislative cards; the remaining {fmrCounts.fallback_rows.toLocaleString('en-PH')}
          {' '}stay visible on region or conflict catch-alls.</p>
      </> : isLocation ? <>
        <h1>Projects resolved through location and office evidence</h1>
        <p>A funded-section title location can place a project on a legislative district when it resolves
          cleanly with a usable DEO, corroborating coordinate, supported direct title hierarchy, or reviewed named site. Otherwise the chain proceeds through one-to-one DEO → district,
          multi-district DEO, region, and unassigned. District-assigned rows place
          {' '}{moneyCompact(locationCounts.located_house_php)} of HGAB3 across
          {' '}{locationCounts.districts_with_location.toLocaleString('en-PH')} districts. Every project
          carries its resolution basis and source-office evidence.</p>
      </> : <>
        <h1>District engineering offices and their representatives</h1>
        <p>One card per office group printed in the DBM NEP and the House 3rd-reading annexes, joined to the
          legislative district it serves through the DEO2LEG crosswalk. Each card reports what that office
          printed — {moneyCompact(index.reconciliation.whole.sources.house.amount_php)} across
          {' '}{index.reconciliation.whole.sources.house.count.toLocaleString('en-PH')} HGAB3 records and
          {' '}{moneyCompact(index.reconciliation.whole.sources.nep.amount_php)} across
          {' '}{index.reconciliation.whole.sources.nep.count.toLocaleString('en-PH')} NEP records.</p>
      </>}
      <div className="hero-actions">
        <ShareLink /></div>
      <p className="fmr-muted congress-disclaimer">{lensInfo.not_claimed}</p>
    </section>

    <div className="fmr-stats">
      {isFmr ? <>
        <Stat label="Districts with FMRs" value={fmrCounts.districts_with_projects.toLocaleString('en-PH')}
          detail={`${fmrCounts.district_rows.toLocaleString('en-PH')} comparison rows assigned`} />
        <Stat label="House FMR allocation" value={moneyCompact(fmrIndex.reconciliation.whole.sources.house.amount_php)}
          detail={`${fmrIndex.reconciliation.whole.sources.house.count.toLocaleString('en-PH')} source projects`} />
        <Stat label="NEP FMR allocation" value={moneyCompact(fmrIndex.reconciliation.whole.sources.nep.amount_php)}
          detail={`${fmrIndex.reconciliation.whole.sources.nep.count.toLocaleString('en-PH')} source projects`} />
        <Stat label="Region / conflict review" value={fmrCounts.fallback_rows.toLocaleString('en-PH')}
          detail={`${fmrCounts.flags.title_coordinate_conflict ?? 0} rows carry title-coordinate conflict evidence`} />
      </> : isLocation ? <>
        <Stat label="Districts assigned" value={locationCounts.districts_with_location.toLocaleString('en-PH')}
          detail={`${locationCounts.located_rows.toLocaleString('en-PH')} rows via title PSGC or DEO → LEG`} />
        <Stat label="District-assigned HGAB3" value={moneyCompact(locationCounts.located_house_php)}
          detail={`${percent(index.reconciliation.whole.sources.house.amount_php
            ? locationCounts.located_house_php / index.reconciliation.whole.sources.house.amount_php : 0)} of the HGAB3 ledger`} />
        <Stat label="Multi-district DEO" value={locationCounts.deo_rows.toLocaleString('en-PH')}
          detail="Full allocations retained on their DEO cards" />
        <Stat label="Region / unassigned"
          value={(locationCounts.region_rows + locationCounts.unassigned_rows).toLocaleString('en-PH')}
          detail={`${locationCounts.flags.changed_office ?? 0} changed-office discrepancies flagged` } />
      </> : <>
        <Stat label="Districts" value={counts.districts.toLocaleString('en-PH')}
          detail={`${counts.cards} office-group cards`} />
        <Stat label="Tier A · one district" value={counts.tier_a.toLocaleString('en-PH')}
          detail="Attributable to that district alone" />
        <Stat label="Tier B · shared range" value={counts.tier_b.toLocaleString('en-PH')}
          detail="Undivided, never split" />
        <Stat label="Unattributable" value={residual.shareText}
          detail={`${residual.rows.toLocaleString('en-PH')} records with no district office`} />
      </>}
    </div>

    <div className="congress-controls">
      <label>Search
        <input type="search" value={searchDraft} placeholder="Representative, district or office…"
          onChange={event => setSearchDraft(event.target.value)}
          onBlur={() => {if (searchDraft !== query) setFilter({q: searchDraft});}}
          onKeyDown={event => {if (event.key === 'Enter' && searchDraft !== query) setFilter({q: searchDraft});}} />
      </label>
      <label>Attribution tier
        <select value={tier} onChange={event => setFilter({tier: event.target.value})}>
          <option value="">All tiers</option>
          {isFmr
            ? FMR_TIER_FILTER.map(([value, label]) => <option key={value} value={value}>{label}</option>)
            : isLocation
            ? LOCATION_TIER_FILTER.map(([value, label]) => <option key={value} value={value}>
                {label}</option>)
            : <>
              <option value="A">Tier A · one district</option>
              <option value="B">Tier B · shared range</option>
              <option value="none">No DEO ledger</option>
            </>}
        </select>
      </label>
      <label>Sort by
        {/* Sort is two decisions — the measure (records or amount) and the
            direction — because "most insertions" and "smallest HGAB3" are both
            natural questions. The default stays out of the URL so a shared
            link is minimal. */}
        <select value={sortState.key}
          onChange={event => setSort({key: event.target.value, direction: 'desc'})}>
          {CARD_SORT_OPTIONS.map(option => <option key={option.key} value={option.key}>
            {option.label}</option>)}
        </select>
      </label>
      <label>Direction
        <select value={sortState.direction} disabled={sortIsNameOnly}
          onChange={event => setSort({key: sortState.key, direction: event.target.value})}>
          <option value="desc">{sortKind === 'records'
            ? 'Most records first' : sortKind === 'amount' ? 'Largest amount first' : 'Descending'}</option>
          <option value="asc">{sortKind === 'records'
            ? 'Fewest records first' : sortKind === 'amount' ? 'Smallest amount first' : 'Ascending'}</option>
        </select>
      </label>
      {(params.sort || params.dir || query || tier || params.summary) &&
        <button type="button" onClick={() => navigate(route,
          {q: null, tier: null, sort: null, dir: null, summary: null})}>Reset view</button>}
      <button type="button" className="secondary" onClick={() => setFilter({summary: '1'})}>
        Show summary</button>
      <span role="status" className="congress-count">
        {visible.length.toLocaleString('en-PH')} of {allCards.length.toLocaleString('en-PH')} cards</span>
    </div>

    <div className="congress-grid">
      {/* The district page is lens-agnostic in its route, so the lens rides as
          a param — a location-lens card id only exists in the location index,
          and a shared link must reopen in the right lens. */}
      {visible.map(card => <DistrictCard key={card.id} card={card} rowFlags={rowFlags}
        onOpen={() => {window.location.hash = href('district',
          {district: card.id, lens: isFmr ? 'fmr' : isLocation ? 'location' : null});}} />)}
    </div>
    {!visible.length && <p className="congress-empty">No card matches those filters.
      {' '}<button type="button" onClick={() => setFilter({q: null, tier: null})}>Clear filters</button></p>}

    {showSummary && <SearchSummary cards={visible} query={query}
      lensLabel={isFmr ? 'FMR legislative lens' : isLocation ? 'Legislative lens' : 'DEO lens'}
      onClose={() => setFilter({summary: null})} />}

    <div className="congress-result-bar">
      <button type="button" className="secondary" onClick={() => setShowPanels(value => !value)}>
        {showPanels ? 'Hide' : 'Show'} what is deliberately not on a card</button>
    </div>

    {showPanels && isFmr ? <>
      <section className="fmr-section congress-panel">
        <h2>How FMR resolution works</h2>
        <p>Each source stage resolves independently: title PSGC plus accepted coordinates, title PSGC
          alone, coordinate-only when every usable point agrees, then region or unassigned. Candidate
          stages that disagree stay on a conflict catch-all; their targets are never unioned into a
          synthetic district range.</p>
      </section>
      <section className="fmr-section congress-panel">
        <h2>What this lens is</h2>
        <dl className="congress-lens">
          <dt>Authority</dt><dd>{lensInfo.authority}</dd>
          <dt>Grouping unit</dt><dd>{lensInfo.grouping_unit}</dd>
          <dt>Grain</dt><dd>{lensInfo.grain}</dd>
          <dt>Stages</dt><dd>{lensInfo.stages}</dd>
          <dt>Not claimed</dt><dd>{lensInfo.not_claimed}</dd>
          <dt>Rows reconciled</dt><dd>{fmrCounts.rows.toLocaleString('en-PH')} comparison rows,
            each on exactly one card; House and NEP totals tie to their printed controls.</dd>
        </dl>
      </section>
    </> : showPanels && isLocation ? <>
      <section className="fmr-section congress-panel">
        <h2>How resolution works</h2>
        <p>The order is clean title location supported by a usable DEO, coordinate, direct title hierarchy, or reviewed named site; one-to-one DEO → legislative district;
          multi-district DEO, region, then unassigned. The
          {' '}{locationCounts.flags.changed_office ?? 0} changed-office rows retain every printed office
          reading; the flag does not alter this order.</p>
      </section>
      <section className="fmr-section congress-panel">
        <h2>What this lens is</h2>
        <dl className="congress-lens">
          <dt>Authority</dt><dd>{lensInfo.authority}</dd>
          <dt>Grouping unit</dt><dd>{lensInfo.grouping_unit}</dd>
          <dt>Grain</dt><dd>{lensInfo.grain}</dd>
          <dt>Stages</dt><dd>{lensInfo.stages}</dd>
          {Object.entries(LOCATION_TIER_LABELS).map(([key, label]) =>
            <React.Fragment key={key}><dt>{LOCATION_TIER_SHORT[key]}</dt><dd>{label}</dd></React.Fragment>)}
          <dt>Not claimed</dt><dd>{lensInfo.not_claimed}</dd>
          <dt>Rows reconciled</dt>
          <dd>{lensInfo.reconciliation.row_counts.total.toLocaleString('en-PH')} ledger rows, every one on
            exactly one card ({lensInfo.reconciliation.row_counts.cards.toLocaleString('en-PH')} card rows,
            no residual), across {lensInfo.reconciliation.tied_numeric_fields} numeric fields tied out
            exactly against the whole ledger.</dd>
        </dl>
      </section>
    </> : showPanels && <>
      <section className="fmr-section congress-panel">
        <h2>{residual.title}</h2>
        <p>{residual.note}</p>
        <div className="fmr-stats">
          <Stat label="NEP side" value={money(residual.nep.amount_php)}
            detail={`${residual.nep.count.toLocaleString('en-PH')} records · ${percent(residual.share.nep)}`} />
          <Stat label="HGAB3 side" value={money(residual.house.amount_php)}
            detail={`${residual.house.count.toLocaleString('en-PH')} records · ${percent(residual.share.house)}`} />
        </div>
      </section>
      <section className="fmr-section congress-panel">
        <h2>{change.title}</h2>
        <p>{change.note}</p>
        <div className="fmr-stats">
          <Stat label="Rows held out" value={change.rows.toLocaleString('en-PH')}
            detail={`${change.crossDistrict} cross-district · ${change.oneSideUnattributable} one side unattributable`} />
          <Stat label="NEP side" value={money(change.nep.amount_php)}
            detail={`${change.nep.count.toLocaleString('en-PH')} records`} />
          <Stat label="HGAB3 side" value={money(change.house.amount_php)}
            detail={`${change.house.count.toLocaleString('en-PH')} records`} />
        </div>
      </section>
      <section className="fmr-section congress-panel">
        <h2>What this lens is</h2>
        <dl className="congress-lens">
          <dt>Authority</dt><dd>{lensInfo.authority}</dd>
          <dt>Grouping unit</dt><dd>{lensInfo.grouping_unit}</dd>
          <dt>Grain</dt><dd>{lensInfo.grain}</dd>
          <dt>Stages</dt><dd>{lensInfo.stages}</dd>
          <dt>Tier A</dt><dd>{lensInfo.tiers.A}</dd>
          <dt>Tier B</dt><dd>{lensInfo.tiers.B}</dd>
          <dt>Not claimed</dt><dd>{lensInfo.not_claimed}</dd>
          <dt>Regional groups excluded</dt>
          <dd>{lensInfo.regional_groups_excluded.map(entry =>
            `${entry.name} (${entry.type} — not an office)`).join('; ')}</dd>
          <dt>Rows reconciled</dt>
          <dd>{lensInfo.reconciliation.row_counts.total.toLocaleString('en-PH')} ledger rows =
            {' '}{lensInfo.reconciliation.row_counts.cards.toLocaleString('en-PH')} on cards +
            {' '}{lensInfo.reconciliation.row_counts.residual.toLocaleString('en-PH')} residual +
            {' '}{lensInfo.reconciliation.row_counts.office_change.toLocaleString('en-PH')} office-change,
            across {lensInfo.reconciliation.tied_numeric_fields} numeric fields tied out exactly
            against the published DPWH Overview.</dd>
        </dl>
      </section>
    </>}
  </>;
}

/** Per-record drawer: flags, both stages, PDF pages, chainage, coordinates. */
export function RecordDrawer({record, onPdf, onMap, onClose}) {
  const sides = [record.house, record.nep, record.api].filter(Boolean);
  return <Dialog label={`Record ${record.id}`} className="congress-drawer" onClose={onClose}>
    <h3>{record.title}</h3>
    <p className="congress-drawer-meta">
      <span className={`fmr-badge`}>{record.bucketLabel ?? BUCKET_LABELS[record.bucket] ?? record.bucket}</span>
      <span className={`fmr-badge ${record.status === 'unmatched' ? 'review' : 'balanced'}`}>
        {record.statusLabel}</span>
      {record.diffTagLabels.map(label => <span key={label} className="fmr-badge">{label}</span>)}
    </p>

    <section><h4>Analytic flags</h4>
      {record.flagLabels.length
        ? <ul className="congress-flags">{record.flagLabels.map(label => <li key={label}>{label}</li>)}</ul>
        : <p className="fmr-muted">No analytic flag on this row.</p>}
      {record.reason && <p className="fmr-muted">Reason: {record.reason}</p>}
      {record.trace && <p className="congress-trace"><code>{record.trace}</code></p>}
    </section>

    {record.analysisFindings?.length > 0 && <section><h4>FMR source-analysis evidence</h4>
      <p className="fmr-muted">These are screening leads derived from the retained FMR source
        records. They do not change the project’s district assignment.</p>
      <ul className="congress-analysis-findings">{record.analysisFindings.map((finding, index) =>
        <li key={`${finding.stage}-${finding.id}-${index}`}>
          <strong>{finding.stageLabel} · {finding.label}</strong>
          <span>{finding.detail}</span>
          <a href={routeHref('analysis', {view: 'red_flags', stage: finding.stage,
            rf_project: finding.projectId}, 'fmr')}>Open this source record in FMR Analysis →</a>
        </li>)}</ul>
      {record.analysisMeasurementNote &&
        <p className="fmr-muted">{record.analysisMeasurementNote}</p>}
    </section>}

    {record.office_discrepancy && <section><h4>Changed office</h4>
      <p>Linked sources name different implementing offices. This records a source discrepancy;
        it does not establish an actual office transfer or change the assignment basis.</p>
      <table className="congress-record-table">
        <thead><tr><th scope="col">Source</th><th scope="col">Printed office</th>
          <th scope="col">Record</th></tr></thead>
        <tbody>{record.office_discrepancy.assignments.map((entry, i) =>
          <tr key={`${entry.stage}-${entry.id}-${i}`}>
            <th scope="row">{entry.source}</th>
            <td>{entry.office}{entry.office_canonical !== entry.office &&
              <small> · normalized as “{entry.office_canonical}”</small>}</td>
            <td><code>{entry.id ?? '—'}</code></td>
          </tr>)}</tbody>
      </table>
    </section>}

    <section><h4>Both stages</h4>
      <table className="congress-record-table">
        <thead><tr><th scope="col">Stage</th><th scope="col">Amount</th><th scope="col">Office</th>
          <th scope="col">Record</th></tr></thead>
        <tbody>{sides.map(side => <tr key={side.kind}>
          <th scope="row">{side.kindLabel}</th>
          <td className="num">{money(side.amount_php)}</td>
          <td>{side.office}{side.office_canonical && side.office_canonical !== side.office &&
            <small> · joined as “{side.office_canonical}”</small>}</td>
          <td><code>{side.id}</code></td>
        </tr>)}</tbody>
      </table>
      {record.house && record.nep && <p className="congress-delta">
        HGAB3 − NEP: <strong>{signedMoney(record.delta_php)}</strong></p>}
      {record.reading_status && <p className="fmr-muted">Reading status: {record.reading_status}</p>}
    </section>

    <section><h4>PDF page source</h4>
      {record.pdf.length
        ? <div className="congress-pdf-buttons">{record.pdf.map(ref =>
            <button key={`${ref.kind}-${ref.page}`} type="button" className="source-link"
              onClick={() => onPdf(ref)}>{ref.documentLabel ?? ref.label} · p. {ref.page}</button>)}</div>
        : <p className="fmr-muted">No PDF page recorded for this row.</p>}
    </section>

    <section><h4>Chainage</h4>
      {record.chainage ? <>
        {[['HGAB3', record.chainage.house], ['NEP', record.chainage.nep]].map(([label, side]) => side &&
          <p key={label} className="congress-chainage"><strong>{label}:</strong> {side.spans || 'length omitted'}
            {side.measured && <span> · {formatLengthKm(side.length_m)}</span>}
            {side.incomplete && <span className="fmr-badge review">incomplete span</span>}
            {side.length_review && <span className="fmr-badge review">
              {chainageLengthReviewLabel(side.length_review)}</span>}
          </p>)}
        {record.chainage.length_delta_m != null
          ? <p className="congress-delta">Length change:
              <strong>{formatSignedKm(record.chainage.length_delta_m)}</strong></p>
          : <p className="fmr-muted">No two-sided length to compare — one stage omitted its
              span length rather than print an unmeasurable figure.</p>}
      </> : <p className="fmr-muted">No chainage printed on either stage.</p>}
    </section>

    <section><h4>Coordinates</h4>
      {record.coordinates ? <ul className="congress-coords">{record.coordinates.map((entry, i) =>
        <li key={i}>{entry.from_title
          ? <span>Printed in the title: {entry.coordinates.lng}, {entry.coordinates.lat}
              <small> · {record.assignment?.key === 'coordinate'
                ? 'corroborates the title PSGC used for this assignment'
                : 'reported as source evidence; see the assignment basis for placement'}</small></span>
          : <span>Carried on the {entry.side} record: {JSON.stringify(entry.coordinates)}</span>}
          {!record.fmr && <> {' '}<a target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${entry.coordinates.lat}&mlon=${entry.coordinates.lng}#map=15/${entry.coordinates.lat}/${entry.coordinates.lng}`}>
            Open in OpenStreetMap ↗</a></>}</li>)}
        </ul>
        : <p className="fmr-muted">{record.fmr
          ? 'No retained source coordinate on this FMR row.'
          : 'No coordinate on this row. DPWH ledgers print no coordinate column; nothing is inferred.'}</p>}
      {record.fmr && onMap && <button type="button" className="secondary"
        onClick={onMap}>Show project map</button>}
    </section>

    <section><h4>Derived traces</h4>
      <dl className="congress-traces">
        <dt>Match basis</dt><dd>{record.match_basis ?? '—'}</dd>
        <dt>Confidence</dt><dd>{record.confidence ?? '—'}</dd>
        <dt>Program</dt><dd>{record.program ?? '—'}</dd>
        <dt>PAP</dt><dd>{record.pap ?? '—'}</dd>
        <dt>Region</dt><dd>{record.region ?? '—'}</dd>
        <dt>Zone</dt><dd>{record.zone ?? '—'}</dd>
        {record.region_difference && <>
          <dt>Region difference</dt>
          <dd>HGAB3 “{record.region_difference.house}” vs NEP “{record.region_difference.nep}” —
            attached as a relaxed-region candidate, not an exact match.</dd></>}
        {record.assignment && <>
          <dt>Assignment basis</dt><dd><strong>{record.assignment.label}</strong>
            {record.assignment.evidence && <> · {record.assignment.evidence}</>}
            <br /><span className="fmr-muted">{record.assignment.detail}</span>
            <br />Target: <code>{record.assignment.targetId}</code></dd>
        </>}
        {record.scope_review && <>
          <dt>Segment scope</dt>
          <dd>Same road, non-overlapping station spans. The amount delta is deliberately not booked
            as a same-project adjustment.</dd></>}
      </dl>
    </section>
  </Dialog>;
}

/** Export chooser: scope (Simple/Full) × format (CSV/JSON) for the filtered rows.
 * Simple is the reviewer's shortlist; Full is everything the explorer holds,
 * including per-side source records. Both split HGAB3 and NEP page citations.
 * Exported for the static-markup render test, like District and Districts. */
export function ExportModal({rows, meta, onClose}) {
  const [scope, setScope] = useState('simple');
  const [format, setFormat] = useState('csv');
  const scopes = [
    ['simple', 'Simple', 'Title, bucket, match status, flags, region, program, both offices, both amounts, delta, and each side’s source page.'],
    ['full', 'Full', 'Everything Simple has plus assignment basis, PAP, source record ids, PDF pages and links, reading status, match basis, trace, chainage and coordinates.'],
  ];
  const formats = [['csv', 'CSV', 'Spreadsheet. Opens in Excel with the same headings as the table.'],
    ['json', 'JSON', 'Structured. Keeps provenance, filters and nested source citations.']];
  const choose = (options, value, setValue, name) => <div className="congress-export-choice">
    {options.map(([key, label, hint]) => <label key={key}
      className={value === key ? 'congress-export-option selected' : 'congress-export-option'}>
      <input type="radio" name={name} value={key} checked={value === key}
        onChange={() => setValue(key)} />
      <span><strong>{label}</strong><small>{hint}</small></span></label>)}</div>;

  return <Dialog label="Export these projects" className="congress-export" onClose={onClose}>
    <p className="fmr-muted">Downloads all <strong>{rows.length.toLocaleString('en-PH')}</strong> rows
      currently in this table{Object.values(meta.filters ?? {}).some(value => value)
        ? ', with your search, bucket and flag filters applied' : ''}. Amounts are in Philippine pesos.
      Source columns cite each ledger side separately and link straight to the page.</p>
    <h3>What to include</h3>
    {choose(scopes, scope, setScope, 'export-scope')}
    <h3>File format</h3>
    {choose(formats, format, setFormat, 'export-format')}
    <div className="fmr-dialog-actions">
      <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="primary" onClick={() => {
        downloadExplorer(rows, {...meta, scope}, format);
        onClose();
      }}>Download {scope === 'simple' ? 'Simple' : 'Full'} {format.toUpperCase()}</button>
    </div>
  </Dialog>;
}

/** The project explorer for one card. */
export function District({index, detail, detailError = '', route, lens = 'deo', locationIndex = null,
  fmrIndex = null}) {
  // As in Districts, every filter and the open record live in the URL, so an
  // explorer view is shareable and restores exactly on a copied link.
  const params = paramsOf(route);
  const cardId = params.district ?? '';
  const activeIndex = lens === 'fmr' && fmrIndex ? fmrIndex
    : lens === 'location' && locationIndex ? locationIndex : index;
  const card = locationCards(activeIndex).find(entry => entry.id === cardId)
    ?? index.cards.find(entry => entry.id === cardId);
  const dataset = params.dataset ?? (lens === 'fmr' ? 'fmr' : 'dpwh');
  const bucket = params.bucket ?? '';
  const flag = params.flag ?? '';
  const query = params.q ?? '';
  const openId = params.record ?? '';
  const [gated, setGated] = useState(null);
  const [pdfSource, setPdfSource] = useState(null);
  const [mapRecord, setMapRecord] = useState(null);
  const [districtMapOpen, setDistrictMapOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const setFilter = patch => navigate(route, patch);
  // Same debounce contract as the card grid: keystrokes stay local, the URL
  // and the row filtering catch up once typing pauses (or on Enter/blur).
  const [searchDraft, setSearchDraft] = useDebouncedSearch(query, q => setFilter({q}), route.key, cardId, 500);

  // congressRows() over the 50 MB payload is expensive, so it runs once per
  // load and both the row lookup and the counterpart map share the result.
  const prepared = useMemo(() => {
    if (!detail) return null;
    if (lens === 'fmr') {
      const rows = fmrRows(detail);
      const fmrAnalysis = Object.fromEntries(['house', 'nep'].map(stage => [stage,
        new Map(buildFmrRedFlags(detail, stage).rows.map(row => [row.id, row]))]));
      return {rows, byId: indexRowsById(rows), counterparts: null, fmrAnalysis};
    }
    const rows = congressRows(detail);
    return {rows, byId: indexRowsById(rows), counterparts: suggestedCounterparts(rows)};
  }, [detail, lens]);

  const explorerRows = useMemo(() => {
    if (!card || !prepared) return [];
    // The built location index supplies both the selected PSGC chain and the
    // exact policy route that placed each row. The browser only reports them.
    const psgcMap = lens === 'location' && locationIndex ? locationIndex.row_psgc ?? {} : {};
    const resolutionMap = lens === 'fmr' && fmrIndex ? fmrIndex.row_resolution ?? {}
      : lens === 'location' && locationIndex ? locationIndex.row_resolution ?? {} : {};
    return cardRows(card, prepared.byId)
      .map(row => lens === 'fmr' ? fmrExplorerRow(row, resolutionMap[row.id], prepared.fmrAnalysis)
        : explorerRow(row, {counterparts: prepared.counterparts, psgc: psgcMap[row.id],
          resolution: resolutionMap[row.id]}));
  }, [card, prepared, lens, locationIndex, fmrIndex]);

  const datasets = useMemo(() => lens === 'fmr'
    ? [{key: 'fmr', label: 'FMR', status: 'active', attributable: true,
        basis: 'FMR title PSGC and accepted coordinate evidence mapped through PSGC2LEG.'}]
    : datasetOptions(index), [index, lens]);
  const active = datasets.find(entry => entry.key === dataset) ?? datasets[0];
  const filtered = useMemo(() => filterExplorerRows(explorerRows, {bucket, flag, query}),
    [explorerRows, bucket, flag, query]);
  const census = useMemo(() => flagCensus(explorerRows, lens === 'fmr' ? FMR_FLAG_LABELS : null),
    [explorerRows, lens]);
  const buckets = useMemo(() => bucketCensus(explorerRows).map(entry => lens === 'fmr'
    ? {...entry, label: FMR_BUCKET_LABELS[entry.bucket] ?? entry.label} : entry), [explorerRows, lens]);
  const openRecord = useMemo(() => explorerRows.find(row => row.id === openId) ?? null,
    [explorerRows, openId]);

  // pdfView only ever emits house-third and nep references: the Transparency
  // API side corroborates identity but prints no page in these ledgers, so
  // there is no third document to map to.
  const openPdf = ref => {
    const reference = sourceReference(ref.kind, ref.page, ref.label);
    if (reference) setPdfSource(reference);
  };

  if (!card) {
    return <section className="fmr-section">
      <h1>District not found</h1>
      <p>No card in the committed index has the id <code>{cardId || '(none)'}</code>.
        A bookmarked card may predate the current crosswalk.</p>
      <a className="primary" href={href('home')}>Back to all districts</a></section>;
  }

  const headline = cardHeadline(card);
  const seats = districtSeats(card);
  const rep = representativeLabel(card);
  const deoLabel = card.location_tier ? null : deoCardLabel(card);
  const roles = leadershipRoles(card);
  const carries = cardCarriesMoney(card);
  const totals = bucketTotals(card);
  // District-first heading for the legislative lenses (location, FMR); null on
  // the DEO lens and on catch-all cards, which keep their own headings.
  const legislative = lens === 'deo' ? null : districtHeading(card);

  const columns = EXPLORER_COLUMNS
    .filter(column => lens !== 'deo' || column.key !== 'assignment')
    .filter(column => lens === 'fmr' || column.key !== 'map')
    .filter(column => lens !== 'fmr' || ['title', 'bucket', 'statusLabel', 'flagLabels',
      'psgc_location', 'assignment', 'region', 'house_php', 'nep_php', 'delta_php', 'map', 'pdf'].includes(column.key))
    .map(column => {
    if (column.key === 'bucket' && lens === 'fmr') {
      return {...column, render: row => FMR_BUCKET_LABELS[row.bucket] ?? row.bucket};
    }
    if (column.key === 'title') {
      return {...column, render: row => <button type="button" className="fmr-text-button"
        onClick={() => setFilter({record: row.id})}>{row.title}
        <small>{row.id}{row.house_office && ` · ${row.house_office}`}</small></button>};
    }
    if (column.key === 'flagLabels') {
      return {...column, render: row => row.flagLabels.length
        ? <span className="congress-flag-chips">{row.flagLabels.slice(0, 3).map(label =>
            <span key={label} className="fmr-badge">{label}</span>)}
            {row.flagLabels.length > 3 && <span className="fmr-muted">+{row.flagLabels.length - 3}</span>}</span>
        : <span className="fmr-muted">—</span>};
    }
    if (column.key === 'psgc_location') {
      return {...column, render: row => {
        if (!row.psgc_location) return <span className="fmr-muted">—</span>;
        const p = row.psgc_location;
        const parts = [p.barangay, p.municipality, p.province].filter(Boolean);
        const full = parts.length ? parts.join(', ') : p.name ?? p.psgc_code;
        const level = p.level === 'barangay' ? 'brgy' : p.level ?? '';
        const tip = [`PSGC ${p.psgc_code}`, `level: ${p.level}`,
          p.support_score != null ? `DOS support score: ${p.support_score}` : null,
          p.named_site_id
            ? 'Resolved through the reviewed named-site registry.'
            : 'Resolved from title evidence; the Assignment basis column states whether it determined placement.']
          .filter(Boolean).join(' · ');
        return <span className="congress-psgc-cell" title={tip}>
          {full}{level && <small> · {level}</small>}
        </span>;
      }};
    }
    if (column.key === 'assignment') {
      return {...column, render: row => row.assignment
        ? <span className="congress-assignment-cell"
            title={`${row.assignment.detail} Target: ${row.assignment.targetId}`}>
            <strong>{row.assignment.label}</strong>
            {row.assignment.evidence && <small>{row.assignment.evidence}</small>}
          </span>
        : <span className="fmr-muted">—</span>};
    }
    if (column.key === 'chainage') {
      return {...column, render: row => {
        if (!row.chainage) return <span className="fmr-muted">—</span>;
        const {house, nep, length_delta_m} = row.chainage;
        // A delta of exactly 0.00 km is a real finding (equal spans), so only a
        // null delta falls back to showing a single side's length.
        const primary = length_delta_m != null ? formatSignedKm(length_delta_m)
          : house?.measured ? formatLengthKm(house.length_m)
          : nep?.measured ? formatLengthKm(nep.length_m) : null;
        return <span className="congress-chainage-cell">
          {(house?.spans || nep?.spans) &&
            <small title={house?.spans ? 'HGAB3 span' : 'NEP span'}>
              {house?.spans || nep?.spans}</small>}
          {primary ? <strong>{primary}</strong> : <span className="fmr-muted">length omitted</span>}
        </span>;
      }};
    }
    if (column.key === 'pdf') {
      return {...column, render: row => row.pdf.length
        ? <span className="congress-pdf-buttons">{row.pdf.slice(0, 3).map(ref =>
            <button key={`${ref.kind}-${ref.page}`} type="button" className="source-link"
              aria-label={`${ref.documentLabel ?? ref.label} p. ${ref.page}`}
              title={`${ref.documentLabel ?? ref.label} · page ${ref.page}`}
              onClick={() => openPdf(ref)}>{ref.documentLabel ?? ref.label} · p. {ref.page}</button>)}</span>
        : <span className="fmr-muted">—</span>};
    }
    if (column.key === 'map') {
      return {...column, render: row => <button type="button" className="source-link"
        onClick={() => setMapRecord(row)}>View map</button>};
    }
    if (column.key === 'delta_php') {
      return {...column, render: row => row.delta_php == null
        ? <span className="fmr-muted">—</span>
        : <span className={row.delta_php > 0 ? 'up' : row.delta_php < 0 ? 'down' : ''}>
            {signedMoney(row.delta_php)}</span>};
    }
    if (column.key === 'house_php' || column.key === 'nep_php') {
      return {...column, render: row => row[column.key] == null
        ? <span className="fmr-muted">—</span> : money(row[column.key])};
    }
    return column;
  });

  return <>
    <section className="hero hero-compact">
      <p className="fmr-eyebrow">FY2027 · Congress · {seats.length ? seats[0].region
        : card.location_tier === 'deo' ? 'District Engineering Office'
        : card.location_tier === 'unassigned' ? 'Unassigned catch-all' : 'Region catch-all'}</p>
      {/* Legislative lenses (location, FMR) lead with the district; the
          representative stays in the secondary line, because the question
          these pages answer is "where did this money land by district".
          DEO-lens headings name the implementing office. Region catch-all
          cards have no representative — the heading is the region name, with
          "Region catch-all" demoted to the eyebrow above, so money is never
          dressed up as a district. */}
      <h1>{legislative?.heading
        ?? (card.location_tier === 'deo' && card.card_label
        ? card.card_label
        : deoLabel ?? (seats.length || !card.card_label ? rep.text
          : card.location_tier === 'region' ? regionName(card.card_label) : card.card_label))}</h1>
      <p className="congress-rep-line">
        {card.location_tier ? <LocationTierBadge card={card} /> : <TierBadge tier={card.tier} />}
        <LeadershipBadge roles={roles} />
        {legislative?.sub && <span className="congress-rep-name">{legislative.sub}</span>}
        {seats.length > 0 ? <>
          {seats.length > 1 && <span>{seats.map(seat => seat.districtName).join(' · ')}</span>}
          {seats.some(seat => seat.representative) && !legislative &&
            <span className="fmr-muted"> · {seats.map(seat => seat.representative).filter(Boolean).join(' · ')}</span>}
          {seats.length > 1 && <span className="fmr-muted"> · undivided range, never split</span>}
        </> : card.location_tier === 'deo' ? <>
          <span>{card.offices?.map(o => o.name).join(' · ') ?? ''}</span>
          <span className="fmr-muted"> · undivided range, never split</span>
        </> : <span>{card.tier_note}</span>}
      </p>
      <div className="hero-actions">
        {/* Back to whichever grid tab is active — the location tab when the
            card was opened from the location lens, the DEO grid otherwise. */}
        <a className="secondary" href={lens === 'fmr' ? href('fmr')
          : lens === 'location' ? href('location') : href('home')}>← All districts</a>
        <ShareLink /></div>
      <p className="fmr-muted congress-disclaimer">
        {card.location_tier
          ? `${(lens === 'fmr' ? FMR_TIER_LABELS : LOCATION_TIER_LABELS)[card.location_tier]}.`
          : `${TIER_LABELS[card.tier]}.`}{' '}
        {carries && seats.length
          ? `These are the records printed by ${card.ledger_names.length ? card.ledger_names.join(' / ') : 'the printed offices on this card'}.`
          : card.tier_note}
      </p>
    </section>

    {carries ? <div className="fmr-stats congress-card-stats">
      <Stat label={lens === 'fmr' ? 'House only' : 'Unsupported insertions'} value={moneyCompact(headline.insertions.amount_php)}
        detail={`${headline.insertions.count.toLocaleString('en-PH')} House-only records`} />
      <Stat label={lens === 'fmr' ? 'NEP only' : 'Deletions'} value={moneyCompact(headline.deletions.amount_php)}
        detail={`${headline.deletions.count.toLocaleString('en-PH')} NEP-only records`} />
      <Stat label="Increases" value={moneyCompact(headline.increased.amount_php)}
        detail={`${headline.increased.count.toLocaleString('en-PH')} pairs`} />
      <Stat label="Decreases" value={moneyCompact(headline.reduced.amount_php)}
        detail={`${headline.reduced.count.toLocaleString('en-PH')} pairs`} />
      <Stat label="Total NEP" value={moneyCompact(headline.nep.amount_php)}
        detail={`${headline.nep.count.toLocaleString('en-PH')} records`} />
      <Stat label="Total HGAB" value={moneyCompact(headline.house.amount_php)}
        detail={`${headline.house.count.toLocaleString('en-PH')} records`} />
    </div> : <p className="congress-no-money-note">{card.tier_note}</p>}

    <section className="fmr-section">
      <h2>Datasets</h2>
      <div className="congress-datasets">
        {datasets.map(entry => <button key={entry.key} type="button"
          className={`congress-dataset${entry.key === active.key ? ' active' : ''}${entry.attributable ? '' : ' gated'}`}
          onClick={() => entry.attributable
            ? setFilter({dataset: entry.key === 'dpwh' ? null : entry.key}) : setGated(entry)}>
          {entry.label}
          <small>{entry.attributable ? 'attributable' : 'not attributable'}</small></button>)}
      </div>
      <p className="fmr-muted">{active.basis ?? active.reason}</p>
    </section>

    <section className="fmr-section">
      <div className="congress-section-heading">
        <h2>Project explorer</h2>
        {lens === 'fmr' && prepared && <button type="button" className="secondary"
          onClick={() => setDistrictMapOpen(true)}>View all segments</button>}
      </div>
      <p>{prepared
        ? <>{filtered.length.toLocaleString('en-PH')} of {explorerRows.length.toLocaleString('en-PH')} records.
          Every row below is one of the records this card’s figures were built from.</>
        : <>This card holds {card.rows.toLocaleString('en-PH')} records.
          Every row is one of the records this card’s figures were built from.</>}
        {searchDraft !== query ? ' · Updating search…' : ''}</p>
      {lens === 'fmr' && <p className="fmr-muted">Analytic flags combine location-assignment
        review with the default source-analysis screens from the FMR workspace. Geometry and
        allocation screens are review leads; open a flagged record for its source-stage evidence.</p>}
      <div className="congress-controls">
        <label>Search
          <input type="search" value={searchDraft} placeholder="Title, office, PAP, region…"
            onChange={event => setSearchDraft(event.target.value)}
            onBlur={() => {if (searchDraft !== query) setFilter({q: searchDraft});}}
            onKeyDown={event => {if (event.key === 'Enter' && searchDraft !== query) setFilter({q: searchDraft});}} /></label>
        <label>Bucket
          <select value={bucket} onChange={event => setFilter({bucket: event.target.value})}>
            <option value="">All buckets</option>
            {buckets.map(entry => <option key={entry.bucket} value={entry.bucket}>
              {entry.label} ({entry.count})</option>)}
          </select></label>
        <label>Analytic flag
          <select value={flag} onChange={event => setFilter({flag: event.target.value})}>
            <option value="">All flags</option>
            {census.map(entry => <option key={entry.flag} value={entry.flag}>
              {entry.label} ({entry.count})</option>)}
          </select></label>
        {(query || bucket || flag) &&
          <button type="button" onClick={() => setFilter({q: null, bucket: null, flag: null})}>
            Clear filters</button>}
        {prepared && <>
          <button type="button" className="secondary"
            disabled={!filtered.length || searchDraft !== query}
            onClick={() => setExportOpen(true)}>Export…</button></>}
      </div>
      {exportOpen && filtered.length > 0 &&
        <ExportModal rows={filtered} meta={{
          lens, card: card.id, filters: {q: query || null, bucket: bucket || null, flag: flag || null},
        }} onClose={() => setExportOpen(false)} />}

      <table className="congress-bucket-table">
        <caption>What each bucket counts, restated from the rows in this table</caption>
        <thead><tr><th scope="col">Bucket</th><th scope="col">Records</th>
          <th scope="col">HGAB3</th><th scope="col">NEP</th><th scope="col">Basis</th></tr></thead>
        <tbody>{buckets.map(entry => <tr key={entry.bucket}
          className={entry.bucket === bucket ? 'selected' : ''}>
          <th scope="row"><button type="button" className="fmr-text-button"
            onClick={() => setFilter({bucket: entry.bucket === bucket ? null : entry.bucket})}>
            {entry.label}</button></th>
          <td className="num">{entry.count.toLocaleString('en-PH')}</td>
          <td className="num">{moneyCompact(entry.house_php)}</td>
          <td className="num">{moneyCompact(entry.nep_php)}</td>
          <td className="congress-basis">{entry.basis}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Card totals</th>
          <td className="num">{card.rows.toLocaleString('en-PH')}</td>
          <td className="num">{moneyCompact(totals.house_php)}</td>
          <td className="num">{moneyCompact(totals.nep_php)}</td>
          <td className="congress-basis">{totals.ties
            ? 'Ties out exactly to the published card figures.'
            : 'Does not tie out — do not publish.'}</td></tr></tfoot>
      </table>

      {!prepared
        ? detailError
          ? <div role="alert" className="congress-detail-error">
              <h3>The project records could not load</h3>
              <p>{detailError}</p>
              <p className="fmr-muted">The card figures above come from the committed district index
                and are unaffected. Only the record explorer needs the full comparison payload.</p>
              <button type="button" onClick={() => window.location.reload()}>Reload</button>
            </div>
          : <p role="status">Loading the comparison payload…</p>
        : <SortableTable columns={columns} rows={filtered}
            ariaLabel={`Projects for ${seats.map(seat => seat.districtName).join(', ')}`}
            tableId="congress-explorer" pageSize={200}
            initialSort={{key: 'house_php', direction: 'desc'}}
            empty="No record matches those filters." />}
    </section>

    {openRecord && <RecordDrawer record={openRecord} onPdf={openPdf}
      onMap={openRecord.fmr ? () => setMapRecord(openRecord) : null}
      onClose={() => setFilter({record: null})} />}
    {mapRecord && <Suspense fallback={<Dialog label="Loading FMR segment map"
      onClose={() => setMapRecord(null)}><p role="status">Loading map…</p></Dialog>}>
      <FmrSegmentModal record={mapRecord} onClose={() => setMapRecord(null)} />
    </Suspense>}
    {districtMapOpen && <Suspense fallback={<Dialog label="Loading district FMR segments"
      onClose={() => setDistrictMapOpen(false)}><p role="status">Loading map…</p></Dialog>}>
      <FmrDistrictSegmentsModal
        label={seats.length ? seats.map(seat => seat.districtName).join(' · ')
          : card.card_label ?? card.id}
        records={explorerRows}
        onSelectRecord={recordId => setFilter({record: recordId})}
        onClose={() => setDistrictMapOpen(false)} />
    </Suspense>}
    {gated && <Dialog label={`${gated.label} is not attributable to a district`} onClose={() => setGated(null)}>
      <p>{gated.reason}</p>
      <p className="fmr-muted">Showing {gated.label} rows here would mean inventing an office from free
        text, which the upstream no-office flag forbids. The {gated.label} workspace reports its own
        totals without a district split.</p>
      <div className="fmr-dialog-actions">
        <a className="secondary" href={`#${gated.key}/home`}>Open the {gated.label} workspace →</a>
        <button type="button" className="primary" onClick={() => setGated(null)}>Stay on DPWH</button>
      </div>
    </Dialog>}
    {pdfSource && <Dialog label={`${pdfSource.document} · p. ${pdfSource.page}`} className="fmr-pdf-dialog"
      onClose={() => setPdfSource(null)}>
      <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
        <PdfPreview source={pdfSource} onClose={() => setPdfSource(null)}
          closeLabel="Close PDF viewer" downloadOriginal /></Suspense>
    </Dialog>}
  </>;
}

export default function CongressApp() {
  const [route, setRoute] = useState(readRoute);
  const [index, setIndex] = useState(null);
  const [locationIndex, setLocationIndex] = useState(null);
  const [fmrIndex, setFmrIndex] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fmrDetail, setFmrDetail] = useState(null);
  const [error, setError] = useState('');
  // The 50 MB payload can fail independently of the index. Scoping its failure
  // keeps the card grid alive: a district page shows a scoped error instead of
  // blanking the whole workspace, and going back recovers without a reload.
  const [detailError, setDetailError] = useState('');
  // The lens is a URL param, not state: a shared #congress?lens=location link
  // must open the same view. The location index (~2 MB) is only fetched when
  // the lens asks for it, so the default view stays as light as before.
  const params = paramsOf(route);
  // The lens is the route now: #congress/location IS the location lens (a
  // tab), while ?lens=location survives only as a legacy share-link form that
  // still opens the same view. Anything else is the DEO lens.
  const lens = route.key === 'fmr' || params.lens === 'fmr' ? 'fmr'
    : route.key === 'location' || params.lens === 'location' ? 'location' : 'deo';

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  // The index is small and always needed; load it once.
  useEffect(() => {
    const controller = new AbortController();
    loadData('congress_district_index_2027.json', controller.signal)
      .then(setIndex)
      .catch(event => {if (event.name !== 'AbortError') setError(event.message);});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (lens !== 'location' || locationIndex) return;
    const controller = new AbortController();
    loadData('location_district_index_2027.json', controller.signal)
      .then(setLocationIndex)
      .catch(event => {if (event.name !== 'AbortError') setError(event.message);});
    return () => controller.abort();
  }, [lens, locationIndex]);

  useEffect(() => {
    if (lens !== 'fmr' || fmrIndex) return;
    const controller = new AbortController();
    loadData('fmr_legislative_index_2027.json', controller.signal)
      .then(setFmrIndex)
      .catch(event => {if (event.name !== 'AbortError') setError(event.message);});
    return () => controller.abort();
  }, [lens, fmrIndex]);

  // The comparison payload is 50 MB, so it is fetched only once a district is
  // opened — the card grid never needs it. A failure here must not take the
  // grid down with it, and a retry (re-entering the district page) must be
  // possible, so the error is cleared before each attempt.
  useEffect(() => {
    if (route.key !== 'district' || lens === 'fmr' || detail) return;
    const controller = new AbortController();
    setDetailError('');
    loadData('comparison_projects_2027.json', controller.signal)
      .then(setDetail)
      .catch(event => {if (event.name !== 'AbortError') setDetailError(event.message);});
    return () => controller.abort();
  }, [route.key, lens, detail]);

  useEffect(() => {
    if (route.key !== 'district' || lens !== 'fmr' || fmrDetail) return;
    const controller = new AbortController();
    setDetailError('');
    fetch(siteUrl('other-analysis/data/fmr_workbench.json'), {signal: controller.signal})
      .then(response => {
        if (!response.ok) throw new Error(`Could not load the FMR comparison payload (${response.status}).`);
        return response.json();
      })
      .then(setFmrDetail)
      .catch(event => {if (event.name !== 'AbortError') setDetailError(event.message);});
    return () => controller.abort();
  }, [route.key, lens, fmrDetail]);

  useEffect(() => {
    document.title = `${route.key === 'district' ? 'District'
      : route.key === 'map' ? 'Map'
      : lens === 'fmr' ? 'FMR (Legislative)'
      : lens === 'location' ? 'Districts (Legislative)' : 'Districts (DEO)'} · Congress FY2027`;
  }, [route.key, lens]);

  return <>
    <a className="fmr-skip" href="#congress-content" onClick={event => {
      event.preventDefault(); document.getElementById('congress-content')?.focus();}}>Skip to content</a>
    {/* The district explorer is a deep-link page, not a tab: keep whichever
        grid tab is active (DEO or Legislative) current so the tab strip does not
        go blank one level down. */}
    <WorkbenchHeader route={route.key === 'district'
      ? (lens === 'fmr' ? 'fmr' : lens === 'location' ? 'location' : 'home') : route.key} workspace="congress" />
    <main id="congress-content" tabIndex={-1} className="shell fmr-main">
      {error ? <div role="alert"><h1>Congress data could not load</h1><p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button></div>
        : route.key === 'map'
          ? <Suspense fallback={<p role="status">Loading the district map…</p>}>
              <CongressMap route={route} /></Suspense>
        : !index ? <p role="status">Loading the district index…</p>
        : lens === 'location' && !locationIndex ? <p role="status">Loading the location index…</p>
        : lens === 'fmr' && !fmrIndex ? <p role="status">Loading the FMR legislative index…</p>
        : route.key === 'district'
          ? <District index={index} detail={lens === 'fmr' ? fmrDetail : detail}
              detailError={detailError} route={route} lens={lens}
              locationIndex={locationIndex} fmrIndex={fmrIndex} />
          : <Districts index={index} route={route} lens={lens}
              locationIndex={locationIndex} fmrIndex={fmrIndex} />}
    </main>
    <footer className="shell fmr-footer">
      <span>FY2027 · Congress — {lens === 'fmr'
        ? 'the FMR legislative lens, title and accepted coordinate PSGC evidence'
        : lens === 'location'
        ? 'the location lens, layered title-location and office resolution'
        : 'the DEO lens, bounded and tier-labelled'}</span>
      {/* DEO2LEG is not packaged into the static site, so the methodology link
          goes to the repository, the same way AboutApp cites it. */}
      <a href={repo + (lens === 'fmr'
        ? 'analysis/docs/fmr_legislative_lens_method.md'
        : lens === 'location'
        ? 'analysis/docs/location_district_lens_method.md'
        : 'DEO2LEG/README.md')} target="_blank" rel="noreferrer">Mapping methodology</a></footer>
  </>;
}

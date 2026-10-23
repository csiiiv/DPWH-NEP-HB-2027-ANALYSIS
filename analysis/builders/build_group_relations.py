#!/usr/bin/env python3
"""Track data states and findings across shell groups, honestly.

Purpose
-------
The dashboard reports what the matcher *committed* to. These views report
what the matcher *saw*, including the possibilities it deliberately left
open. The two are allowed to disagree — and when they do, the disagreement
is itself the finding worth reading. Nothing here re-matches or re-scores
rows; edges are harvested from ``source_comparison_2027.json`` so every
claim traces back to a decision the matcher already recorded.

Shells reuse the ``build_road_groups`` key (funding zone + PAP + region +
road title base, or work + municipality + province for place shells), so
"Groupings" and "Relations" describe the same clusters.

Row states
----------
Every row carries exactly one explicit state so a reader never has to infer
how much confidence to place in it:

``committed_attached``   Matcher paired it and booked the delta. Identity is
                         provisional but the money moved.
``review_attached``      Paired for scope review only (disjoint road
                         segments). Delta deliberately NOT booked.
``open_candidate``       Unpaired, with one or more visible possibilities
                         (fuzzy or duplicate-key suggestions).
``duplicate_key``        Unpaired inside a repeated exact key — no automatic
                         pairing is possible without a human tie-break.
``twin_cross_referenced`` Unpaired, but an identical title+amount row sits
                         unmatched on the other side under a different
                         program section.
``unmatched_insertion``  House row with no counterpart and no suggestion.
``unmatched_deletion``   NEP row with no counterpart and no suggestion.

Finding types
-------------
``competing_candidates``  One row has two or more candidate edges. The
                          matcher committed to at most one; the others stay
                          visible. Money at stake = shell amount gap.
``committed_with_rivals`` The matcher committed a pair while other candidates
                          for the same row remained plausible. This is the
                          clearest dashboard-vs-relations divergence.
``shell_amount_gap``      Shell totals differ across sides with no attached
                          pair explaining the gap.
``zero_overlap_attached`` Measured spans share no overlap — attached for
                          review, delta withheld.
``cross_pap_twin``        Identical row under different program sections.
``unsupplied_shell``      One side of a shell is fully paired while the other
                          still holds rows.

Emitted sidecars (all in ``analysis/data``)
------------------------------------------
``group_relations_index_2027.json``    Manifest, state census, finding
    counts, region rollup, one compact line per multi-edge shell.
``group_relations_states_2027.json``   Every row with its state, shell and
    edge references — the authoritative state ledger.
``group_relations_findings_2027.json`` Enumerated findings ranked by money at
    stake, each carrying evidence ids so a reader can jump to the rows.
``group_relations_shells_2027.json``   Full node + edge detail for shells
    carrying more than one candidate edge.
``group_relations_ambiguity_2027.json`` Competing-node subset with members.
``group_relations_twins_2027.json``    Cross-PAP twin cross-references.
``group_relations_overlaps_2027.json`` Chainage overlap spectrum across
    every measured attached pair.

These views annotate. They never change a match status, book a delta or
certify an identity.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path[:0] = [str(Path(__file__).resolve().parents[1]),
                str(Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA  # noqa: E402
from build_road_groups import _side_key  # noqa: E402
from build_current_pages import segment_overlap_ratio  # noqa: E402

ATTACHED_STATUSES = (
    'exact_candidate', 'chainage_candidate', 'location_amendment_candidate',
    'soft_match_candidate', 'scope_amendment_candidate',
    'segment_scope_candidate',
)

# Edge kinds a reader can act on. 'attached' edges are what the matcher
# already committed to; the rest are possibilities it deliberately left open.
EDGE_KINDS = (
    'exact', 'chainage', 'location_amendment', 'soft_match',
    'scope_amendment', 'segment_scope', 'fuzzy', 'ambiguous',
)
_EDGE_FROM_STATUS = {
    'exact_candidate': 'exact',
    'chainage_candidate': 'chainage',
    'location_amendment_candidate': 'location_amendment',
    'soft_match_candidate': 'soft_match',
    'scope_amendment_candidate': 'scope_amendment',
    'segment_scope_candidate': 'segment_scope',
}
# Edge kinds whose delta is booked as a same-project adjustment.
BOOKED_KINDS = ('exact', 'chainage', 'location_amendment', 'soft_match',
                'scope_amendment')
# Edge kinds that attach a pair but withhold the delta for review.
REVIEW_KINDS = ('segment_scope',)
# Edge kinds that consume nothing and commit nothing.
OPEN_KINDS = ('fuzzy', 'ambiguous')

# Explicit row states. Each row carries exactly one; readers never have to
# infer how much confidence to place in a row from its status alone.
ROW_STATES = (
    'committed_attached', 'review_attached', 'open_candidate', 'duplicate_key',
    'twin_cross_referenced', 'unmatched_insertion', 'unmatched_deletion',
)
# Integer codes for the compact id -> [state, side] map. Position in ROW_STATES
# IS the state code, so no separate table can drift out of sync. A code of -1
# in the map means the row id was referenced but never harvested.
STATE_CODE = {s: i for i, s in enumerate(ROW_STATES)}
SIDE_CODE = {'house': 0, 'nep': 1}
# Fields kept on the rich per-row record. Row identity (title, amounts,
# program, pap, region, zone, pdf page) already lives on the node payload, so
# the state record stores only what the state machine added.
_STATE_DETAIL_FIELDS = ('shell', 'edges', 'twin_of', 'matcher_status')
# Higher wins when a row is described more than once: a committed or review
# attachment outranks an open possibility, which outranks a bare unmatched
# claim. This keeps state assignment independent of record order.
_STATE_RANK = {
    'committed_attached': 6,
    'review_attached': 5,
    'duplicate_key': 4,
    'twin_cross_referenced': 3,
    'open_candidate': 2,
    'unmatched_insertion': 1,
    'unmatched_deletion': 1,
}
STATE_INFO = {
    'committed_attached': (
        'Matcher paired this row and booked the amount delta. Identity stays '
        'provisional — no pair is manually certified — but the money moved.'),
    'review_attached': (
        'Paired for scope review only: measured station spans share no '
        'overlap, so these are different segments of one road. The amount '
        'delta is deliberately withheld from adjustment totals.'),
    'open_candidate': (
        'Unpaired, with one or more visible possibilities (title-similarity '
        'or duplicate-key suggestions). Nothing was consumed or committed.'),
    'duplicate_key': (
        'Unpaired inside a repeated exact key. No automatic pairing is '
        'possible without a human tie-break; amount alone must not decide it.'),
    'twin_cross_referenced': (
        'Unpaired, but an identical normalized title + region + zone + equal '
        'amount row sits unmatched on the other side under a different '
        'program section. Cross-referenced, never auto-paired.'),
    'unmatched_insertion': (
        'House row with no NEP counterpart and no suggestion. An insertion '
        'candidate — not a certified insertion.'),
    'unmatched_deletion': (
        'NEP row with no House counterpart and no suggestion. A deletion '
        'candidate — not a certified removal or cancellation.'),
}
# Explains the state census. Kept as one constant because the index (which the
# Relations view paints first, from the census alone) and the states overlay
# (which adds the per-row codes) both quote it — a literal in each would let
# the two drift apart.
STATES_NOTE = (
    'One explicit state per row, assigned by rank so record order '
    'cannot change the answer: committed attachment outranks '
    'review-only attachment, which outranks duplicate-key and twin '
    'cross-references, which outrank open possibilities, which '
    'outrank a bare unmatched claim. This is a thin overlay keyed by '
    'the same row ids the dashboard already loads — join on id rather '
    'than expecting a second copy of each row. "rows" maps every row '
    'to [state_index, side_index]; "detail" adds the shell, matcher '
    'status, edge references and twin pointer for rows in shells that '
    'have a finding, competition, a twin or a measured span. States '
    'describe what the matcher did and what it withheld — none of '
    'them certify identity, and a state of committed_attached still '
    'means provisional, not proven.'
)

# Finding types: what a reader should act on, each with evidence ids.
FINDING_TYPES = (
    'competing_candidates', 'committed_with_rivals', 'shell_amount_gap',
    'zero_overlap_attached', 'cross_pap_twin', 'unsupplied_shell',
)
FINDING_INFO = {
    'competing_candidates': (
        'One row carries two or more candidate edges. The matcher committed '
        'to at most one; the rest stay visible rather than being discarded.'),
    'committed_with_rivals': (
        'The matcher committed a pair while other candidates for the same row '
        'remained plausible. The clearest case where the relation view and '
        'the dashboard legitimately disagree — read both.'),
    'shell_amount_gap': (
        'Shell totals differ across sides and no attached pair explains the '
        'gap. Could be a split, a re-scope, or rows that belong elsewhere.'),
    'zero_overlap_attached': (
        'Measured spans share no overlap. Attached for scope review; the '
        'amount delta is withheld from adjustment totals.'),
    'cross_pap_twin': (
        'Identical row under different program sections on both sides, both '
        'left unmatched. Transfer or duplicate printing — unproven either way.'),
    'unsupplied_shell': (
        'One side of a shell is fully paired while the other still holds '
        'rows: split / insertion candidates, or dropped / re-titled items.'),
}


def read(name: str):
    return json.loads((DATA / name).read_text())


# How many shells the index roster carries. The index is what a view fetches
# first, so it holds a ranked entry point rather than a census: the counts and
# amounts in `summary` cover every shell, and the full roster lives in the
# `shells` sidecar. Truncation is declared in the payload, never silent.
INDEX_SHELL_LIMIT = 400


def write_json(name: str, payload, *, indent: int | None = None) -> int:
    """Emit one sidecar and return its size in bytes.

    Large machine-read payloads go out compact (the precedent set by
    build_house_readings and build_chainage_units); small human-inspected ones
    stay indented so a git diff of e.g. the twin list is readable.
    """
    path = DATA / name
    if indent:
        text = json.dumps(payload, ensure_ascii=False, indent=indent) + '\n'
    else:
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    path.write_text(text)
    return path.stat().st_size


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _node(row: dict, side: str) -> dict:
    """Compact node payload — enough to render and to open the row elsewhere."""
    return {
        'id': row.get('id'),
        'side': side,
        'title': row.get('title'),
        'amount_php': row.get('amount_php'),
        'program': row.get('program'),
        'pap': row.get('pap'),
        'pap_id': row.get('pap_id'),
        'zone': row.get('zone'),
        'region': row.get('region'),
        'office': row.get('office'),
        'pdf_page': row.get('pdf_page'),
    }


def _key_hash(key: tuple) -> str:
    """Short stable digest of a full shell key."""
    return hashlib.sha256(
        json.dumps(list(key), ensure_ascii=False).encode()).hexdigest()[:10]


def _shell_label(key: tuple) -> str:
    """Unique, readable id for a shell key.

    The key is (zone, pap, region, kind, base), and labelling on kind+base
    alone silently merges genuinely distinct shells: one named road corridor
    appears under many PAP/region combinations (e.g. Maharlika Highway sits
    under a dozen), and merging those would pool money across programs and
    misstate every amount gap and competing-node count. Bases may themselves
    contain '|' (place shells are ``work|mun|prov``), so no readable
    concatenation can be trusted to round-trip — a short digest of the whole
    key makes the id provably 1:1. build() asserts that rather than assuming
    it.
    """
    return f'{key[3]}:{key[4]}#{_key_hash(key)}'


def harvest(records: list[dict]):
    """Project comparison records onto shell groups with harvested edges."""
    nodes: dict[str, dict] = {}          # row id -> node
    shells: dict[tuple, dict] = {}       # shell key -> shell
    edges: list[dict] = []
    twins: list[dict] = []
    overlaps: list[dict] = []
    states: dict[str, dict] = {}         # row id -> state record

    def shell_for(key: tuple) -> dict:
        s = shells.get(key)
        if s is None:
            s = shells[key] = {
                'shell': _shell_label(key),
                'zone': key[0], 'pap': key[1], 'region': key[2],
                'kind': key[3], 'base': key[4],
                'house_ids': [], 'nep_ids': [], 'edges': [],
            }
        return s

    def note_node(row: dict, side: str, key: tuple) -> None:
        rid = row.get('id')
        if rid is None:
            return
        nodes.setdefault(rid, _node(row, side))
        s = shell_for(key)
        bucket = s['house_ids'] if side == 'house' else s['nep_ids']
        if rid not in bucket:
            bucket.append(rid)

    def set_state(row, side, state, key, *, status=None, edge_index=None,
                  twin_of=None) -> None:
        """Record the explicit state of one row.

        States are order-independent: a more informative state always wins,
        so a NEP row that is both a fuzzy target and separately emitted as
        nep_unmatched keeps ``open_candidate`` rather than being downgraded.
        Edge references always accumulate.
        """
        rid = row.get('id')
        if rid is None:
            return
        prev = states.get(rid)
        if prev and _STATE_RANK[prev['state']] >= _STATE_RANK[state]:
            # Keep the stronger state, but still absorb new evidence.
            if edge_index is not None and edge_index not in prev.get('edges', []):
                prev.setdefault('edges', []).append(edge_index)
                prev['edges'] = sorted(prev['edges'])
            if twin_of and not prev.get('twin_of'):
                prev['twin_of'] = twin_of
            return
        entry = {
            'id': rid, 'side': side, 'state': state,
            'shell': _shell_label(key),
            'title': row.get('title'),
            'amount_php': row.get('amount_php'),
            'pap_id': row.get('pap_id'),
            'program': row.get('program'),
            'region': row.get('region'),
            'zone': row.get('zone'),
            'pdf_page': row.get('pdf_page'),
        }
        if status:
            entry['matcher_status'] = status
        carried = (prev or {}).get('edges', [])
        entry['edges'] = sorted(set(carried + ([edge_index] if edge_index is not None else [])))
        if twin_of or (prev or {}).get('twin_of'):
            entry['twin_of'] = twin_of or prev['twin_of']
        states[rid] = entry

    def add_edge(h_row, n_row, kind, *, confidence=None, identity_score=None,
                 amount_ratio=None, diff_tags=None, overlap_ratio=None,
                 delta_php=None, reason=None, shell_key=None):
        h_id, n_id = h_row.get('id'), n_row.get('id')
        if h_id is None or n_id is None:
            return None
        edge = {
            'house': h_id, 'nep': n_id, 'kind': kind,
            'house_amount_php': h_row.get('amount_php'),
            'nep_amount_php': n_row.get('amount_php'),
            'house_pap_id': h_row.get('pap_id'),
            'nep_pap_id': n_row.get('pap_id'),
        }
        if confidence is not None:
            edge['confidence'] = confidence
        if identity_score is not None:
            edge['identity_score'] = identity_score
        if amount_ratio is not None:
            edge['amount_ratio'] = amount_ratio
        if diff_tags:
            edge['diff_tags'] = diff_tags
        if overlap_ratio is not None:
            edge['overlap_ratio'] = overlap_ratio
        if delta_php is not None:
            edge['delta_php'] = delta_php
        if reason:
            edge['reason'] = reason
        edges.append(edge)
        idx = len(edges) - 1
        if shell_key is not None:
            shells[shell_key]['edges'].append(idx)
            # Stamp the anchoring shell on the edge. Degrees in _shell_stats
            # are counted per shell, so without this a reader rendering one
            # shell from the sidecar would recompute a global degree and
            # disagree with competing_degrees.
            edge['shell'] = _shell_label(shell_key)
        return idx

    for rec in records:
        status = rec.get('status')
        h_row, n_row = rec.get('house'), rec.get('nep')
        h_key = _side_key(rec, 'house') if h_row else None
        n_key = _side_key(rec, 'nep') if n_row else None
        # Anchor the shell on the House side when present: that is the sheet
        # a reviewer reads. NEP-only rows anchor on their own shell.
        key = h_key or n_key
        if key is None:
            continue
        if h_row:
            note_node(h_row, 'house', h_key or key)
        if n_row:
            note_node(n_row, 'nep', n_key or key)

        if status in ATTACHED_STATUSES and h_row and n_row:
            kind = _EDGE_FROM_STATUS[status]
            overlap = (segment_overlap_ratio(h_row, n_row)
                       if kind in ('chainage', 'segment_scope') else None)
            idx = add_edge(h_row, n_row, kind,
                           confidence=rec.get('confidence'),
                           overlap_ratio=(round(overlap, 4) if overlap is not None else None),
                           delta_php=rec.get('delta_php'),
                           reason=rec.get('reason'),
                           shell_key=key)
            # Booked kinds move money; review kinds attach without booking.
            state = ('committed_attached' if kind in BOOKED_KINDS
                     else 'review_attached')
            set_state(h_row, 'house', state, h_key or key,
                      status=status, edge_index=idx)
            set_state(n_row, 'nep', state, n_key or key,
                      status=status, edge_index=idx)
            if overlap is not None:
                overlaps.append({
                    'house': h_row.get('id'), 'nep': n_row.get('id'),
                    'kind': kind, 'overlap_ratio': round(overlap, 4),
                    'delta_php': rec.get('delta_php'),
                    'house_amount_php': h_row.get('amount_php'),
                    'nep_amount_php': n_row.get('amount_php'),
                    'shell': _shell_label(key), 'region': key[2],
                    'title': h_row.get('title'),
                })
        elif status in ('fuzzy_candidate', 'ambiguous') and h_row:
            kind = 'fuzzy' if status == 'fuzzy_candidate' else 'ambiguous'
            # Duplicate exact keys cannot be paired automatically; plain
            # fuzzy suggestions are open possibilities.
            h_state = 'duplicate_key' if kind == 'ambiguous' else 'open_candidate'
            for cand in rec.get('candidates') or []:
                c_row = cand.get('nep')
                if not c_row:
                    continue
                idx = add_edge(h_row, c_row, kind,
                               confidence=cand.get('confidence'),
                               identity_score=cand.get('identity_score'),
                               amount_ratio=cand.get('amount_ratio'),
                               diff_tags=cand.get('diff_tags'),
                               reason=rec.get('reason'),
                               shell_key=key)
                set_state(h_row, 'house', h_state, h_key or key,
                          status=status, edge_index=idx)
                # The suggested NEP row is still open: it was not consumed.
                set_state(c_row, 'nep', 'open_candidate', n_key or key,
                          status=status, edge_index=idx)
        elif status == 'house_unmatched' and h_row:
            set_state(h_row, 'house', 'unmatched_insertion', h_key or key,
                      status=status)
        elif status == 'nep_unmatched' and n_row:
            set_state(n_row, 'nep', 'unmatched_deletion', n_key or key,
                      status=status)

        twin = rec.get('twin_review')
        if twin:
            # Refine whichever side this record carries; the counterpart is
            # refined when its own record is visited.
            if h_row:
                set_state(h_row, 'house', 'twin_cross_referenced', h_key or key,
                          status=status, twin_of=twin.get('other_side_id'))
                twins.append({
                    'house': h_row.get('id'),
                    'nep': twin.get('other_side_id'),
                    'title': h_row.get('title'),
                    'amount_php': h_row.get('amount_php'),
                    'house_pap_id': h_row.get('pap_id'),
                    'nep_pap_id': twin.get('other_side_pap_id'),
                    'house_program': h_row.get('program'),
                    'nep_program': twin.get('other_side_program'),
                    'region': h_row.get('region'),
                    'zone': h_row.get('zone'),
                    'shell': _shell_label(h_key or key),
                    'house_pdf_page': h_row.get('pdf_page'),
                    'note': twin.get('note'),
                })
            elif n_row:
                set_state(n_row, 'nep', 'twin_cross_referenced', n_key or key,
                          status=status, twin_of=twin.get('other_side_id'))

    return nodes, shells, edges, twins, overlaps, states


def _shell_stats(shell: dict, edges: list[dict], nodes: dict) -> dict:
    """Per-shell rollup: money on each side, edge mix, competition degree."""
    shell_edges = [edges[i] for i in shell['edges']]
    degree: Counter = Counter()
    kinds: Counter = Counter()
    for e in shell_edges:
        degree[e['house']] += 1
        degree[e['nep']] += 1
        kinds[e['kind']] += 1
    house_php = sum(nodes[i]['amount_php'] or 0 for i in shell['house_ids'] if i in nodes)
    nep_php = sum(nodes[i]['amount_php'] or 0 for i in shell['nep_ids'] if i in nodes)
    competing = [rid for rid, d in degree.items() if d > 1]
    open_kinds = [k for k in kinds if k in ('fuzzy', 'ambiguous', 'segment_scope')]
    return {
        'shell': shell['shell'], 'zone': shell['zone'], 'pap': shell['pap'],
        'region': shell['region'], 'kind': shell['kind'], 'base': shell['base'],
        'house_rows': len(shell['house_ids']), 'nep_rows': len(shell['nep_ids']),
        'edges': len(shell_edges),
        'edge_kinds': dict(kinds),
        'competing_nodes': len(competing),
        'competing_ids': competing,
        'competing_degrees': {rid: degree[rid] for rid in competing},
        'has_open_edges': bool(open_kinds),
        'open_kinds': open_kinds,
        'house_amount_php': house_php, 'nep_amount_php': nep_php,
        'amount_gap_php': house_php - nep_php,
        'title': next((nodes[i]['title'] for i in shell['house_ids'] + shell['nep_ids']
                       if i in nodes and nodes[i].get('title')), ''),
    }


def _state_of(states: dict, rid) -> str:
    """State label for a row id, or 'unseen' when the id never reached harvest.

    Row ids come from matcher output; a candidate may reference an id whose
    own record was never emitted. Reporting 'unseen' is more honest than
    guessing a state for a row we have no record of.
    """
    s = states.get(rid)
    return s['state'] if s else 'unseen'


def _amount_of(states: dict, rid):
    s = states.get(rid)
    return (s.get('amount_php') or 0) if s else 0


# Finding fields that hold row ids. Centralised so the findings sidecar can
# attach exactly the row bodies it cites, and so adding a new evidence field
# here automatically makes it resolvable in the UI.
_FINDING_ID_FIELDS = ('house', 'nep', 'rival_nodes', 'unsupplied_ids')


def _finding_node_ids(findings: list[dict], nodes: dict) -> set:
    """Row ids cited by findings that we actually have a body for."""
    cited = set()
    for f in findings:
        for field in _FINDING_ID_FIELDS:
            v = f.get(field)
            if v is None:
                continue
            cited.update(v if isinstance(v, (list, tuple)) else [v])
    return cited & set(nodes)


def _enumerate_findings(shells, stats_by_shell, edges, states, twins, overlaps):
    """Turn harvested structure into explicit, ranked findings.

    Each finding names its type, the money at stake, and the evidence ids so
    a reader can jump straight to the rows. Findings are observations, not
    verdicts: they never assert that a match is wrong, and they are allowed
    to point at something the dashboard resolved differently.
    """
    findings = []
    # Members per shell, so leftover/unsupplied counts are O(1) per shell.
    members = defaultdict(lambda: {'house': [], 'nep': []})
    for rid, s in states.items():
        members[s['shell']][s['side']].append((rid, s['state']))

    for key, shell in shells.items():
        label = _shell_label(key)
        r = stats_by_shell.get(label)
        if r is None:
            continue
        # The shell already carries its own edge indices — no rescanning.
        shell_edges = [edges[i] for i in shell['edges']]
        edge_kinds = Counter(e['kind'] for e in shell_edges)
        booked = sum(edge_kinds[k] for k in BOOKED_KINDS)
        rivals = r['competing_ids']
        gap = r['amount_gap_php']

        if rivals:
            # Committed rows that still had plausible rivals are the sharpest
            # divergence between what the dashboard booked and what was seen.
            committed = [rid for rid in rivals
                         if _state_of(states, rid) in ('committed_attached',
                                                       'review_attached')]
            ftype = 'committed_with_rivals' if committed else 'competing_candidates'
            findings.append({
                'type': ftype,
                'shell': label, 'region': r['region'], 'kind': r['kind'],
                'title': r['title'],
                'amount_at_stake_php': abs(gap),
                'rival_nodes': sorted(rivals),
                'rival_degrees': {rid: r['competing_degrees'][rid]
                                  for rid in sorted(rivals)},
                'rival_states': {rid: _state_of(states, rid) for rid in sorted(rivals)},
                'committed_nodes': sorted(committed),
                'edge_count': len(shell_edges),
                'edge_kinds': dict(edge_kinds),
                'house_rows': r['house_rows'], 'nep_rows': r['nep_rows'],
            })

        # A gap is only worth flagging when BOTH sides actually hold rows.
        # A one-sided shell is just unmatched rows, already counted in the
        # state census and (when the other side has edges) as unsupplied_shell.
        # Emitting one per one-sided shell would bury the real signal.
        if (gap and not booked
                and r['house_rows'] and r['nep_rows']):
            findings.append({
                'type': 'shell_amount_gap',
                'shell': label, 'region': r['region'], 'kind': r['kind'],
                'title': r['title'],
                'amount_at_stake_php': abs(gap),
                'house_amount_php': r['house_amount_php'],
                'nep_amount_php': r['nep_amount_php'],
                'edge_kinds': dict(edge_kinds),
                'house_rows': r['house_rows'], 'nep_rows': r['nep_rows'],
            })

        # Unsupplied: pairs anchored this shell, yet one side still holds rows
        # that no attachment consumed. Those are split/insertion or
        # dropped/re-titled candidates — never certified as either.
        if booked:
            leftovers = {
                side: [rid for rid, st in members[label][side]
                       if st not in ('committed_attached', 'review_attached')]
                for side in ('house', 'nep')
            }
            for side, ids in leftovers.items():
                if not ids:
                    continue
                findings.append({
                    'type': 'unsupplied_shell',
                    'shell': label, 'region': r['region'], 'kind': r['kind'],
                    'title': r['title'],
                    'amount_at_stake_php': sum(
                        _amount_of(states, i) for i in ids),
                    'unsupplied_side': side,
                    'unsupplied_ids': sorted(ids),
                    'unsupplied_states': {i: _state_of(states, i) for i in sorted(ids)},
                    'house_rows': r['house_rows'], 'nep_rows': r['nep_rows'],
                })

    # Segment-scope pairs carry their shell/region on the overlap record, so
    # the finding can name where to look rather than reporting a bare pair.
    overlap_by_pair = {(o['house'], o['nep']): o for o in overlaps}
    for e in edges:
        if e['kind'] == 'segment_scope':
            ov = overlap_by_pair.get((e['house'], e['nep']), {})
            findings.append({
                'type': 'zero_overlap_attached',
                'shell': ov.get('shell'), 'region': ov.get('region'), 'kind': None,
                'title': ov.get('title'),
                'amount_at_stake_php': abs(e.get('delta_php') or 0),
                'house': e['house'], 'nep': e['nep'],
                'overlap_ratio': e.get('overlap_ratio'),
                'delta_php': e.get('delta_php'),
                'delta_booked': False,
                'reason': e.get('reason'),
            })

    for t in twins:
        findings.append({
            'type': 'cross_pap_twin',
            'shell': None, 'region': t.get('region'), 'kind': None,
            'title': t.get('title'),
            'amount_at_stake_php': t.get('amount_php') or 0,
            'house': t.get('house'), 'nep': t.get('nep'),
            'house_pap_id': t.get('house_pap_id'), 'nep_pap_id': t.get('nep_pap_id'),
            'house_program': t.get('house_program'), 'nep_program': t.get('nep_program'),
            'note': FINDING_INFO['cross_pap_twin'],
        })

    order = {t: i for i, t in enumerate(FINDING_TYPES)}
    findings.sort(key=lambda f: (order.get(f['type'], 99),
                                 -f['amount_at_stake_php']))
    return findings


def build() -> dict:
    comparison = read('source_comparison_2027.json')
    records = comparison['projects']
    nodes, shells, edges, twins, overlaps, states = harvest(records)

    # Shell labels are used as cross-file join keys (states, findings, index,
    # overlaps all reference them), so a collision would silently merge two
    # different shells and pool their money. Prove 1:1 instead of trusting the
    # digest.
    labels = [_shell_label(k) for k in shells]
    assert len(set(labels)) == len(shells), (
        f'shell labels collide: {len(shells)} keys -> {len(set(labels))} labels')

    stats_rows = [_shell_stats(s, edges, nodes) for s in shells.values()]
    stats_by_shell = {r['shell']: r for r in stats_rows}
    # Multi-edge shells are where a reader sees possibilities rather than a
    # single forced answer; single-edge shells are already resolved 1:1.
    multi = [r for r in stats_rows if r['edges'] > 1]
    competing = [r for r in stats_rows if r['competing_nodes'] > 0]
    multi.sort(key=lambda r: (-r['edges'], -abs(r['amount_gap_php']), r['shell']))
    competing.sort(key=lambda r: (-abs(r['amount_gap_php']), r['shell']))

    findings = _enumerate_findings(shells, stats_by_shell, edges, states, twins,
                                   overlaps)
    finding_counts = Counter(f['type'] for f in findings)
    # State census: how many rows sit in each explicit state, and how much
    # money each state carries. This is the honest headline — it says what we
    # know, what we withheld, and what we left open.
    state_census = {
        state: {
            'rows': 0, 'amount_php': 0,
            'house_rows': 0, 'nep_rows': 0,
            'description': STATE_INFO[state],
        }
        for state in ROW_STATES
    }
    for s in states.values():
        c = state_census[s['state']]
        c['rows'] += 1
        c['amount_php'] += s['amount_php'] or 0
        c['house_rows' if s['side'] == 'house' else 'nep_rows'] += 1

    # Overlap spectrum: explicit bounds per bucket. Every non-zero bucket is
    # (lo, hi] with hi inclusive except where flagged, and exactly-zero is its
    # own bucket, so each measured pair lands in exactly one bucket. The
    # contiguity assertion below proves it rather than assuming it.
    #   (label, lo_exclusive, hi, include_hi)   hi=None → unbounded above
    buckets = [
        ('zero — disjoint segments', None, None, False),
        ('over 0% up to 5%', 0.0, 0.05, True),
        ('over 5% up to 25%', 0.05, 0.25, True),
        ('over 25% up to 50%', 0.25, 0.5, True),
        ('over 50% up to 75%', 0.5, 0.75, True),
        ('over 75% below 100%', 0.75, 1.0, False),
        ('100% — identical span', 1.0, None, False),
    ]
    spectrum = []
    accounted = 0
    for label, lo, hi, include_hi in buckets:
        if lo is None:                       # exactly-zero bucket
            rows = [o for o in overlaps if o['overlap_ratio'] == 0.0]
        elif hi is None:                     # unbounded above
            rows = [o for o in overlaps if o['overlap_ratio'] >= lo]
        elif include_hi:                     # (lo, hi]
            rows = [o for o in overlaps if lo < o['overlap_ratio'] <= hi]
        else:                                # (lo, hi)
            rows = [o for o in overlaps if lo < o['overlap_ratio'] < hi]
        accounted += len(rows)
        spectrum.append({
            'bucket': label, 'pairs': len(rows),
            # Bounds ship with the bucket so a reader (and the test suite)
            # replays the declared partition instead of re-deriving it from
            # the label text. lo is exclusive, hi follows include_hi, and
            # null on both means "exactly zero"; null hi alone means unbounded.
            'lo': lo, 'hi': hi, 'include_hi': include_hi,
            'gross_abs_delta_php': sum(abs(r['delta_php'] or 0) for r in rows),
            'net_delta_php': sum(r['delta_php'] or 0 for r in rows),
            'sample': sorted(rows, key=lambda r: -abs(r['delta_php'] or 0))[:5],
        })
    # Contiguity check: buckets must partition every measured pair exactly
    # once. A silent gap or overlap here would misstate the zero-overlap
    # population that the segment gate depends on.
    assert accounted == len(overlaps), (
        f'overlap buckets double-count or drop pairs: '
        f'{accounted} bucketed vs {len(overlaps)} measured')

    region_roll: dict[str, dict] = {}
    for r in stats_rows:
        e = region_roll.setdefault(r['region'] or 'No recorded region', {
            'region': r['region'] or 'No recorded region', 'shells': 0,
            'multi_edge_shells': 0, 'competing_shells': 0, 'edges': 0,
            'house_amount_php': 0, 'nep_amount_php': 0,
            'competing_amount_php': 0,
        })
        e['shells'] += 1
        e['edges'] += r['edges']
        e['house_amount_php'] += r['house_amount_php']
        e['nep_amount_php'] += r['nep_amount_php']
        if r['edges'] > 1:
            e['multi_edge_shells'] += 1
        if r['competing_nodes']:
            e['competing_shells'] += 1
            e['competing_amount_php'] += abs(r['amount_gap_php'])

    edge_kind_totals = Counter(e['kind'] for e in edges)
    built_at = datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds')
    input_digest = digest(DATA / 'source_comparison_2027.json')
    manifest = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_at': built_at,
        'generator': {'path': 'analysis/builders/build_group_relations.py',
                      'sha256': digest(Path(__file__))},
        'inputs': {'source_comparison_2027.json': input_digest},
        'method': (
            'Relation views are harvested from the retained matcher output — '
            'every edge is an attachment, candidate, twin cross-reference or '
            'segment gate that build_current_pages already emitted. No pair is '
            're-matched, re-scored or certified here, so these views cannot '
            'disagree with the dashboard. Shells reuse the build_road_groups '
            'key (funding zone + PAP + region + road title base, or work + '
            'municipality + province), so Groupings and Relations describe the '
            'same clusters. Competing nodes are rows with more than one '
            'candidate edge: the matcher left them open on purpose.'
        ),
        'edge_kinds': {
            'exact': 'Committed attachment — identical normalized key.',
            'chainage': 'Committed attachment — same road base, overlapping spans.',
            'location_amendment': 'Committed attachment — relocated place slot.',
            'soft_match': 'Committed attachment — OCR/facility/wording review.',
            'scope_amendment': 'Committed attachment — scope change, delta booked.',
            'segment_scope': 'Attached for review only — spans share no overlap, delta NOT booked.',
            'fuzzy': 'Open possibility — title-similarity suggestion, consumes nothing.',
            'ambiguous': 'Open possibility — duplicate key, no automatic pairing.',
        },
    }

    # --- sidecar 1: index (small; what the view fetches first) -----------
    index = {
        'manifest': manifest,
        'summary': {
            'shells': len(stats_rows),
            'multi_edge_shells': len(multi),
            'competing_shells': len(competing),
            'nodes': len(nodes),
            'edges': len(edges),
            'edge_kinds': dict(edge_kind_totals),
            'twin_pairs': len(twins),
            'twin_amount_php': sum(t['amount_php'] or 0 for t in twins),
            'measured_pairs': len(overlaps),
            'zero_overlap_pairs': sum(1 for o in overlaps if o['overlap_ratio'] == 0.0),
            'zero_overlap_gross_abs_delta_php': sum(
                abs(o['delta_php'] or 0) for o in overlaps if o['overlap_ratio'] == 0.0),
            'house_amount_php': sum(r['house_amount_php'] for r in stats_rows),
            'nep_amount_php': sum(r['nep_amount_php'] for r in stats_rows),
            'rows_stated': len(states),
            'state_census': {k: {kk: vv for kk, vv in v.items()
                                 if kk != 'description'}
                             for k, v in state_census.items()},
            'finding_counts': {t: finding_counts.get(t, 0) for t in FINDING_TYPES},
            'findings_amount_at_stake_php': sum(f['amount_at_stake_php'] for f in findings),
        },
        'state_definitions': STATE_INFO,
        # The census below is quotable on its own: the Relations view paints
        # its States tab from the index alone, so the explanation of what the
        # states mean ships here rather than only in the per-row overlay.
        'states_note': STATES_NOTE,
        'finding_definitions': FINDING_INFO,
        'overlap_spectrum': spectrum,
        'region_summary': sorted(region_roll.values(),
                                 key=lambda r: -r['competing_amount_php']),
        # A ranked entry point, not a census: top multi-edge shells by edge
        # count then money at stake. The full roster lives in the `shells`
        # sidecar, and the truncation is declared here rather than implied.
        'shells': [{k: v for k, v in r.items() if k != 'competing_ids'}
                   for r in multi[:INDEX_SHELL_LIMIT]],
        'shells_truncated': {
            'shown': min(len(multi), INDEX_SHELL_LIMIT),
            'total': len(multi),
            'full_roster_in': 'group_relations_shells_2027.json',
        } if len(multi) > INDEX_SHELL_LIMIT else None,
    }
    index = {k: v for k, v in index.items() if v is not None}
    write_json('group_relations_index_2027.json', index, indent=1)

    # --- sidecar 2: full node + edge detail for shells worth opening -----
    # The roster must cover every shell a reader can be sent to: from the
    # index, from a finding, from the ambiguity list, from a twin or from a
    # measured span. Leaving a finding's shell out of the roster would make
    # the finding a dead end — the reader clicks and there is nothing to open.
    keep_shells = (
        {r['shell'] for r in multi}
        | {r['shell'] for r in competing}
        | {f['shell'] for f in findings if f.get('shell')}
        | {t['shell'] for t in twins if t.get('shell')}
        | {o['shell'] for o in overlaps if o.get('shell')}
    )
    stats_by_label = {r['shell']: r for r in stats_rows}
    keep_shells &= set(stats_by_label)
    kept_keys = {k for k in shells if _shell_label(k) in keep_shells}
    # Edges belonging to a kept shell, so the detail file stays bounded.
    keep_edge_idx = {i for k in kept_keys for i in shells[k]['edges']}
    keep_edges = [edges[i] for i in sorted(keep_edge_idx)]
    # Rows on both sides of a kept shell, not just rows an edge touched: a
    # shell_amount_gap or unsupplied_shell finding is precisely about rows no
    # edge consumed, and those must be visible to make the finding readable.
    used_nodes = {i for e in keep_edges for i in (e['house'], e['nep'])}
    # Member ids per side, so a drilldown can list every row of the shell —
    # including rows no edge touched — straight from the roster entry.
    members_by_label = {
        _shell_label(k): {'house_ids': sorted(shells[k]['house_ids']),
                          'nep_ids': sorted(shells[k]['nep_ids'])}
        for k in kept_keys}
    for k in kept_keys:
        used_nodes.update(shells[k]['house_ids'])
        used_nodes.update(shells[k]['nep_ids'])
    detail = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'shells': len(keep_shells), 'nodes': len(used_nodes),
                     'edges': len(keep_edges),
                     'note': (
                         'Every shell the other views can point at, plus the '
                         'row bodies and edges needed to render it without a '
                         'second fetch. Coverage is multi-edge shells, '
                         'competing shells, shells named by a finding, by a '
                         'twin or by a measured span — so no finding dead '
                         'ends. Rows are included on both sides even when no '
                         'edge consumed them, because shell_amount_gap and '
                         'unsupplied_shell are about exactly those rows.'
                     )},
        'nodes': {i: nodes[i] for i in sorted(used_nodes)},
        'edges': keep_edges,
        'shells': {label: {**stats_by_label[label],
                           **members_by_label.get(label, {})}
                   for label in sorted(keep_shells)},
    }
    write_json('group_relations_shells_2027.json', detail)

    # --- sidecar 3: ambiguity subset (competing nodes only) --------------
    ambiguity = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'shells': len(competing)},
        'note': (
            'A competing node has more than one candidate edge: the matcher '
            'found several plausible counterparts and deliberately committed '
            'to none, or committed to one while leaving others visible. '
            'Ranked by the money at stake in the shell.'
        ),
        'shells': [{**{k: v for k, v in r.items()},
                    'nodes': {i: nodes[i] for i in r['competing_ids'] if i in nodes}}
                   for r in competing],
    }
    write_json('group_relations_ambiguity_2027.json', ambiguity, indent=1)

    # --- sidecar 4: cross-PAP twins --------------------------------------
    twin_payload = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'pairs': len(twins)},
        'note': (
            'Identical normalized title + region + zone + equal amount left '
            'unmatched on both sides under different program/PAP sections. '
            'Cross-referenced, never auto-paired: both rows keep their '
            'insertion/deletion candidacy until a human certifies the pair.'
        ),
        'twins': sorted(twins, key=lambda t: -(t['amount_php'] or 0)),
        'nodes': {i: nodes[i] for i in sorted(
            ({t['house'] for t in twins} | {t['nep'] for t in twins}) & set(nodes))},
    }
    write_json('group_relations_twins_2027.json', twin_payload, indent=1)

    # --- sidecar 5: chainage overlap spectrum ----------------------------
    overlap_payload = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'pairs': len(overlaps)},
        'note': (
            'Measured station-span overlap for every chainage-bearing attached '
            'pair. Overlap is metres shared divided by the shorter span. '
            'Zero overlap means disjoint segments of the same road: attached '
            'for scope review, amount delta deliberately not booked.'
        ),
        'spectrum': spectrum,
        'pairs': sorted(overlaps, key=lambda o: (o['overlap_ratio'],
                                                 -abs(o['delta_php'] or 0))),
    }
    write_json('group_relations_overlaps_2027.json', overlap_payload)

    # --- sidecar 6: row states -------------------------------------------
    # A thin overlay, not a copy of the rows. The dashboard already holds the
    # row bodies (from source_comparison_2027), so this file carries only what
    # the state machine added, keyed by the same row ids:
    #   rows   -> id : [state_index, side_index] for EVERY row (cheap, loads
    #             first, enough for state badges anywhere in the dashboard)
    #   detail -> shell / matcher_status / edge refs / twin, only for rows in
    #             shells that actually have something to look at
    # Nothing here duplicates title, program, region or amount — those are
    # joined from the row the reader is already looking at.
    detail_shells = keep_shells
    state_map = {}
    state_detail = {}
    for rid, s in states.items():
        key = str(rid)
        state_map[key] = [STATE_CODE.get(s['state'], -1), SIDE_CODE[s['side']]]
        if s['shell'] in detail_shells:
            det = {k: s[k] for k in _STATE_DETAIL_FIELDS if s.get(k) not in (None, [])}
            if det:
                state_detail[key] = det
    states_payload = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'rows': len(states), 'detailed_rows': len(state_detail),
                     'detailed_shells': len(detail_shells)},
        'note': STATES_NOTE,
        'states': list(ROW_STATES),
        'state_definitions': STATE_INFO,
        'sides': ['house', 'nep'],
        'census': state_census,
        'rows': {k: state_map[k] for k in sorted(state_map)},
        'detail': {k: state_detail[k] for k in sorted(state_detail)},
    }
    write_json('group_relations_states_2027.json', states_payload)

    # --- sidecar 7: findings ---------------------------------------------
    findings_payload = {
        'manifest': {'built_at': built_at, 'input_sha256': input_digest,
                     'findings': len(findings)},
        'note': (
            'Enumerated observations, each naming its type, the money at '
            'stake and the evidence row ids so a reader can jump straight to '
            'them. Findings are not verdicts: they never assert a committed '
            'pair is wrong, and "committed_with_rivals" exists precisely to '
            'show where this view and the dashboard legitimately differ. '
            'Sorted by type priority, then by amount descending.'
        ),
        'types': list(FINDING_TYPES),
        'type_definitions': FINDING_INFO,
        'counts': {t: finding_counts.get(t, 0) for t in FINDING_TYPES},
        'amount_at_stake_by_type': {
            t: sum(f['amount_at_stake_php'] for f in findings if f['type'] == t)
            for t in FINDING_TYPES
        },
        'findings': findings,
        # Row bodies only for ids the findings actually cite, so a reader can
        # see what a finding points at without fetching a second file.
        'nodes': {i: nodes[i] for i in sorted(_finding_node_ids(findings, nodes))},
    }
    write_json('group_relations_findings_2027.json', findings_payload)

    written = {
        'index': (DATA / 'group_relations_index_2027.json').stat().st_size,
        'shells': (DATA / 'group_relations_shells_2027.json').stat().st_size,
        'ambiguity': (DATA / 'group_relations_ambiguity_2027.json').stat().st_size,
        'twins': (DATA / 'group_relations_twins_2027.json').stat().st_size,
        'overlaps': (DATA / 'group_relations_overlaps_2027.json').stat().st_size,
        'states': (DATA / 'group_relations_states_2027.json').stat().st_size,
        'findings': (DATA / 'group_relations_findings_2027.json').stat().st_size,
    }
    print(json.dumps({'summary': index['summary'], 'bytes': written},
                     ensure_ascii=False, indent=2))
    return index


if __name__ == '__main__':
    build()

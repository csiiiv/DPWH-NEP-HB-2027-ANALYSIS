# 0004. Treat unmatched / fuzzy rows as candidates, not insertions

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

Early three-way dashboards labeled House-only API matches as insertions and
API-only rows as removals. OCR title noise, incomplete API coverage, region
conflicts, and uncertified pairings make those labels policy claims they
cannot support. How should cross-source matching be presented?

## Decision Drivers

* Avoid false “pork insertion” / “House cut” headlines from matcher leftovers
* Amount equality alone does not prove identity
* Fuzzy suggestions must not consume NEP rows or claim certification
* Printed control differences stay separate from project-match outcomes

## Considered Options

1. Keep insertion/removal labels on unmatched greedy-matcher leftovers
2. Suppress unmatched rows until every pair is hand-certified
3. Candidate vocabulary: exact / fuzzy / ambiguous / unmatched; zero certified by default

## Decision Outcome

Chosen option: **3 — candidate vocabulary**.

The current comparison (`source_comparison_2027`) uses unique normalized
title + region + PAP/zone as one-to-one exact candidates; duplicates stay
ambiguous; remaining House rows may get non-consuming fuzzy suggestions.
**No pair is manually certified unless explicitly recorded.** Joebert dumps
and historical `crosscheck_2027` / taxonomy viewers are labeled historical
or candidate-only.

### Consequences

* Good: dashboards separate printed budget deltas from match status
* Good: API and Joebert gaps cannot be misread as House policy by default
* Bad: readers must not equate “unmatched” with “new project”
* Bad: certification work remains open (manual review queue)

## More Information

* [../../viewers/source_comparison_2027.html](../../viewers/source_comparison_2027.html)
* [../joebert_native_crosscheck.md](../joebert_native_crosscheck.md)
* [../../viewers/crosscheck_2027.md](../../viewers/crosscheck_2027.md) (historical)

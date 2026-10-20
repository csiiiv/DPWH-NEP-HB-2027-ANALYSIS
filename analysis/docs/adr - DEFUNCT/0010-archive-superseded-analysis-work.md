# 0010. Archive superseded and exploratory analysis by role

- Status: Accepted
- Date: 2026-10-09

## Context

Current source verification shared folders and site navigation with retired OCR
parsers, historical House trees, older matchers, exploratory external dumps, and
sample reports. A dependency check also found historical helpers and control
inputs still required to reproduce current candidates.

## Outcome

Move superseded and exploratory material into `analysis/archive/`, grouped as
builders, data, docs, viewers, tests, evidence, and external candidates. Record
original paths and hashes in a relocation manifest. Preserve historical JSON
bytes and provenance, adapting source imports and text links for the new layout.

Retain the three independent verification viewers, detailed NEP viewer,
candidate comparison, stage trace, and their source/evidence dependencies.
Use explicit archive helper imports and archived-data paths for the few active
rebuild dependencies. Archive provenance does not claim independent row certification.

## Consequences

- The published site serves six retained viewers; repository history remains accessible.
- Archived regression suites run separately from current tests and Pages CI.
- Historical House outputs remain reproducible with their retained inputs and local caches.
- Existing published URLs for archived viewers are removed from the current package.
- Restoring a file requires checking its consumers and freshness manifests.

See [archive index](../../archive/README.md) and [current layout](../../README.md).

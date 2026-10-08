# 0009. Use navigable source paths and a shared review workspace

- Status: Accepted
- Date: 2026-10-09

## Context

Review candidates need their parent hierarchy, expenditure context, and source
page. Static path labels and dense tables made it difficult to return to the
relevant entity, especially when search or class filters hid it.

## Options

1. Keep path labels as text and use separate review screens.
2. Navigate paths within a shared tree and evidence workspace.

## Outcome

Choose option 2. Each breadcrumb and review-context segment selects its exact
entity, expands ancestors, clears hiding filters, and focuses the tree row.
Navigation outside an expense scope restores the full hierarchy. Review queues
can be restricted by branch, class, and evidence category.

Show source images before unverified text candidates and keep arithmetic and
source-evidence states separate. Offer exact-peso tree amounts, reset, search
shortcut, and mobile tree/evidence panels without losing selection. Available
source page references link to retained evidence; API rows receive no invented
PDF references. Shared template, JavaScript, and CSS are manifest-bound.

## Consequences

- Reviewers can move between a candidate and its hierarchy without losing identity.
- Balanced branches can visibly retain pending source checks.
- UI navigation neither resolves flags nor changes allocation amounts.
- Packaging must include shared styles and the source-evidence image index.

See [implemented UI and validation](../pages_update_assessment.md) and
[source verification workflow](../source_hierarchy_verification.md).

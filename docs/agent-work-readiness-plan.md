# Agent Work Readiness Plan

Status: active proposal
Owner: Border Empires maintainers

## Goal

Make the repository safe and efficient for parallel coding agents: agents should
find the current rule quickly, work from the correct branch, and not mistake a
historical plan for an executable instruction.

## Success measures

- A normal feature branch starts from and rebases on `origin/develop`.
- Every maintained document has one clear role: canonical, runbook, proposal,
  or historical record.
- A new agent can select the right entrypoint from `docs/README.md` without a
  broad documentation search.
- CI prevents dead local documentation links and regressions in agent-critical
  workflow helpers.

## Delivery plan

### Phase 1 — Source-of-truth foundation (completed 2026-09-26)

Correct feature-branch and CI contradictions, make the worktree helper default
to `origin/develop`, add a docs map/lifecycle policy, and record this plan.

### Phase 2 — Curate the existing inventory (completed 2026-09-26)

Add status headers to maintained documents. Move dated rewrite, legacy, and
superseded implementation plans to `docs/archive/`; remove documents whose
only value is already preserved by Git history. Update links as part of each
move.

## Phase 2 implementation plan

### Scope

Move only documents that are dangerous as active instructions because they
describe a superseded runtime, a completed one-time execution, or a system now
known to be shipped. Preserve their history under `docs/archive/` rather than
deleting them. Mark maintained documents with a clear lifecycle status.

### Archive set

- `docs/archive/rewrite-2026/`: the dated rewrite plans, completion summary,
  gateway review, Phase 6 rebase notes, server-architecture plan, legacy
  restoration/parity audit, and parity-record runbook.
- `docs/archive/design-history-2026/`: the original GOAP plan, build-pipeline
  plan, obsolete glTF pipeline proposal, gold-sinks proposal, three legacy
  tech-tree snapshots, and the two mustering plans that claim the feature is
  unshipped.

### Retained-document labels

Add a `Status:` line to maintained operational references, runbooks, product
references, active proposals, and exploratory research. Do not rewrite their
substantive design content in this phase; Phase 3 owns that consolidation.

### Steps

1. Create an archive index that says archived records are context, not current
   implementation instructions.
2. Move the archive set with Git, preserving history.
3. Update every tracked reference to a moved path, including code comments and
   historical records that cite another archived record.
4. Label the retained documents by lifecycle role and add the archive to the
   documentation map.
5. Verify no tracked reference names a removed active path and that all
   Markdown links in changed documentation resolve locally.

### Acceptance criteria

- No current instruction can direct an agent to execute the legacy or dated
  rewrite plans.
- Historical context remains reachable under a stable archive path.
- Every retained documentation artifact has an explicit lifecycle status.
- Existing code comments that point to historical context use the archive path.

### Verification

Run the documentation-reference scan, `git diff --check`,
`pnpm check:file-lines`, and `pnpm test:scripts`. This phase does not touch
runtime behavior, so a full product test run is not required beyond the CI
already completed for Phase 1.

### Phase 3 — Consolidate current knowledge

Extract live rules from large delivered plans into concise canonical references.
Keep active proposals focused on undecided work. Add or refresh scoped runbooks
only where repeated rediscovery has occurred.

### Phase 3 implementation plan

#### Scope

Separate the shipped resource-and-manpower rules from the long mixed
manpower-economy plan without rewriting implementation history or changing
runtime behavior. This is deliberately limited to the repeatedly cited economy
record; it establishes the pattern for the next knowledge domain.

#### Steps

1. Inspect the shared economy constants and the simulation's manpower, slot,
   and economy modules; record only demonstrated behavior.
2. Add a small `docs/product/` canonical-reference index and a focused
   resource-and-manpower reference that names its code owners.
3. Link the new reference from the documentation map and gameplay reference.
4. Re-label the old plan as historical and update the active proposal that
   described it as the current economy source.
5. Review archive files directly: every record must identify itself as
   historical even when opened without the archive index.

#### Acceptance criteria

- An agent can find live resource-and-manpower rules without searching an
  implementation-history plan.
- The reference distinguishes demonstrated current rules from historical
  rationale and points to each rule's owning code.
- No archived file can be mistaken for an executable plan when opened alone.
- No runtime code, protocol, balance value, or player-visible behavior changes.

#### Verification

Run focused lifecycle-header and outdated-plan-language scans, `git diff
--check`, `pnpm check:file-lines`, and `pnpm test:scripts`.

### Phase 3 — Consolidate current knowledge (completed 2026-09-26)

Implemented [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md),
converted the delivered economy plan to a historical record, and added direct
historical markers to every archived file. The next phase can enforce these
contracts mechanically.

### Phase 4 — Enforce documentation contracts

Add a fast CI check for Markdown links and tracked local references. Add tests
for agent-critical helper defaults and ensure documentation checks run in the
same local gate as CI.

### Phase 5 — Standardize change records

Add short templates for proposals, decisions, and runbooks. Require a declared
owner, status, replacement target, and verification date for active documents.

### Phase 6 — Measure and maintain

Review documentation changes quarterly or after major stack changes. Track
broken-link failures, repeated agent rediscovery, and docs changed without a
matching code/workflow change; use those signals to refine the map.

## Phase 1 implementation plan

### Scope

This phase changes only agent-facing workflow and documentation navigation. It
does not archive existing plans, alter runtime code, or add a general Markdown
lint dependency.

### Steps

1. Change normal-work instructions from `origin/main` to `origin/develop`,
   retaining an explicit `main` hotfix exception.
2. Make `scripts/create-worktree.sh` default to `origin/develop` and add a
   regression test for that default.
3. Correct the contribution guide's false statement about pull-request CI and
   align pre-PR verification on `pnpm ci:local`.
4. Add `docs/README.md` as the documentation router and lifecycle policy.
5. Add the full readiness plan and link it from the router.

### Acceptance criteria

- `pnpm worktree:new <slug>` uses `origin/develop` when no start point is
  supplied.
- Root and concurrent-agent instructions consistently identify `develop` as
  the normal feature base and `main` as the explicit-hotfix exception.
- The contributor guide accurately describes PR CI.
- The documentation router links to the main operational and product entrypoints.
- The new regression test runs through `pnpm test:scripts`.

### Verification

Run the focused helper test, check all changed Markdown links locally, then run
`pnpm ci:local` before opening the PR.

### Rollback

Revert this documentation-only commit and the helper-default commit together.
No runtime data or deployed behavior is affected.

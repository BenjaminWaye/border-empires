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

### Phase 1 — Source-of-truth foundation

Correct feature-branch and CI contradictions, make the worktree helper default
to `origin/develop`, add a docs map/lifecycle policy, and record this plan.

### Phase 2 — Curate the existing inventory

Add status headers to maintained documents. Move dated rewrite, legacy, and
superseded implementation plans to `docs/archive/`; remove documents whose
only value is already preserved by Git history. Update links as part of each
move.

### Phase 3 — Consolidate current knowledge

Extract live rules from large delivered plans into concise canonical references.
Keep active proposals focused on undecided work. Add or refresh scoped runbooks
only where repeated rediscovery has occurred.

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

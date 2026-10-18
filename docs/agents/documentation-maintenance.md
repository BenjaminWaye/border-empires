# Documentation Maintenance

Status: runbook
Owner: Border Empires maintainers
Last verified: 2026-10-18

## When to use this

Run this review quarterly and after a material workflow, package-layout,
runtime-stack, or player-rule change. Its outcome is either an updated
canonical reference or a deliberately archived/superseded record.

## Procedure

1. Run `pnpm check:agent-readiness`, `pnpm check:docs`, and `pnpm test:scripts`
   from a current worktree. In a fresh worktree, build the shared package
   first (`pnpm --filter @border-empires/shared build`): the script-test soak
   harness imports its compiled output.
2. Review changed runtime, workflow, and entrypoint files since the previous
   review. Confirm their canonical documents still describe the current state.
   For every gameplay change, follow the [lore maintenance policy](../lore/README.md):
   read the affected [world-bible](../lore/galactic-lore.md) sections, update
   their fiction in the same branch, and update current gameplay references.
   Record a reviewed, unchanged canon explicitly when only numerical rules change.
3. Review every active proposal: name an owner, set `Last verified`, and either
   keep it active, update its replacement target, or archive/remove it.
4. Search for repeated agent rediscovery (the same paths, commands, or
   historical-plan confusion in PRs/issues). Promote recurring facts into the
   smallest canonical reference or runbook.
5. Record the review date and any follow-up in the relevant canonical document
   or a tracked proposal; do not create free-floating investigation notes.

## Signals

- `pnpm check:docs` failures: broken links or lifecycle-contract drift.
- Repeated documentation-only fixes: an entrypoint or ownership map is unclear.
- Runtime/workflow changes without a nearby documentation update: stale-source
  risk; update docs in the same branch next time.
- Gameplay changes whose fictional explanation exists only in a plan or PR:
  move accepted lore into the world bible and link to it. Treat open canon
  questions and unimplemented setting concepts separately from current rules.
- Active proposals with an old verification date: make a decision, refresh
  evidence, or archive them.

## Verification and rollback

The review passes when `pnpm check:docs` and `pnpm test:scripts` pass and every
follow-up has a clear owner. Documentation-only corrections can be reverted as
ordinary commits; never revert a runtime change merely to make documentation
appear current.

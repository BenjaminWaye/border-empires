# Documentation Map

Status: canonical

This directory holds the repository's maintained operating knowledge. Prefer
the smallest document that answers the task at hand; source code and tests
remain authoritative for runtime behavior.

## Start here

| Need | Read |
|---|---|
| Repository-wide operating rules | [`../AGENTS.md`](../AGENTS.md) |
| Relic mechanics, reserves, discovery and legacy compatibility | [`relics.md`](relics.md) |
| Lore entrypoint and required gameplay-change lore check | [`lore/README.md`](lore/README.md) |
| Canonical setting, Houses, Coin, Manifests and AFC fiction | [`lore/galactic-lore.md`](lore/galactic-lore.md) |
| Local setup, package layout, CI, and release notes | [`../README.md`](../README.md) |
| Deploying or using Fly/Vercel/Hetzner | [`agents/deploys.md`](agents/deploys.md) |
| Fly → Hetzner migration plan | [`hetzner-migration-plan.md`](hetzner-migration-plan.md) |
| Sync-delay exports, timing interpretation and player-scoped server traces | [`agents/topics/sync-delay-diagnostics.md`](agents/topics/sync-delay-diagnostics.md) |
| Tests, debugging, and regression expectations | [`agents/testing-and-debugging.md`](agents/testing-and-debugging.md) |
| Concurrent worktree and branch safety | [`agents/concurrent-agents.md`](agents/concurrent-agents.md) |
| Landing a PR end to end (review → fix → merge to `develop`) | [`../.claude/skills/review-fix-merge/SKILL.md`](../.claude/skills/review-fix-merge/SKILL.md) |
| Documentation review and upkeep | [`agents/documentation-maintenance.md`](agents/documentation-maintenance.md) |
| AI planning | [`agents/topics/ai-planner.md`](agents/topics/ai-planner.md) |
| AI progression recovery, aether and proactive diplomacy review | [`ai-progression-improvements-plan.md`](ai-progression-improvements-plan.md) |
| Local gameplay verification | [`agents/topics/agent-gameplay-testing.md`](agents/topics/agent-gameplay-testing.md) |
| Current gameplay rules | [`game-mechanics.md`](game-mechanics.md) |
| AFC Specializations: campaign rules, thirty rewards and lore | [`afc-specializations-catalog.md`](afc-specializations-catalog.md) |
| AFC Specializations: implementation and verification | [`afc-specializations-execution.md`](afc-specializations-execution.md) |
| AFC Specializations: original design and UI decisions | [`afc-specializations-plan.md`](afc-specializations-plan.md) |
| Historical relic anchor proposal (superseded) | [`relics-design.md`](relics-design.md) |
| Reach-vision implementation record | [`reach-border-vision-plan.md`](reach-border-vision-plan.md) |
| Rivers remake, river heads and river mountains (renderer + worldgen v11/v12) | [`rivers-remake-plan.md`](rivers-remake-plan.md) |
| Stacking-building adjacency / industrial districts (proposed) | [`stacking-adjacency-plan.md`](stacking-adjacency-plan.md) |
| Storybook cleanup: what was removed, the new layout and guardrails | [`storybook-cleanup-plan.md`](storybook-cleanup-plan.md) |
| Current manpower and resource-slot rules | [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md) |
| Starter-site contract and new-player guidance | [`product/new-player-opening.md`](product/new-player-opening.md) |
| Adding a structure | [`adding-a-structure-playbook.md`](adding-a-structure-playbook.md) |
| Relic redesign: execution stages, finite reserves and depleted map state | [`relics-execution-plan.md`](relics-execution-plan.md) |
| Accepted relic ziggurat: visual references and implementation history | [`relic-overlay-preview.md`](relic-overlay-preview.md) |

## Document lifecycle

- **Canonical** documents describe current, durable facts or required workflow.
- **Runbooks** provide short, repeatable procedures for a recurring task.
- **Active proposals** describe an owned, not-yet-shipped change. They must say
  what is proposed, who owns the next decision, and what document they replace
  when delivered.
- **Historical records** preserve a decision or completed investigation without
  being instructions for new work. They belong in `docs/archive/`.

New or substantially revised documentation must include a `Status:` line near
the top. Do not create a standalone doc for one-off investigation notes; keep
those in the issue or PR until they prove recurring.

## Maintenance

- Update the canonical document in the same branch as a workflow, entrypoint,
  or player-facing-rule change.
- Every gameplay change includes the [lore check](lore/README.md#every-gameplay-change-includes-a-lore-check).
  Update affected fiction in the world bible in the same branch. Canon,
  proposed fiction and implementation status are separate; planning records
  and supporting stories cannot override established lore.
- Prefer links to a canonical source over copying its rules into a plan.
- When an active proposal ships, update the canonical reference and archive or
  remove the implementation plan in the same follow-up.
- Before retiring a document, check inbound links and update them. Git history
  remains the recovery path for obsolete execution detail.
- Follow [`agents/documentation-maintenance.md`](agents/documentation-maintenance.md)
  quarterly and after material runtime or workflow changes.

## Historical records

[`archive/README.md`](archive/README.md) indexes completed investigations and
superseded plans. Archive documents are context only, never current execution
instructions.

## Current improvement plan

[`agent-work-readiness-plan.md`](agent-work-readiness-plan.md) tracks the
repository's documentation and agent-workflow cleanup in phases.
[`code-cleanup-plan.md`](code-cleanup-plan.md) records the October 2026
dead-code and duplication cleanup and the remaining items in priority order.
[`playtest-improvements-plan.md`](playtest-improvements-plan.md) tracks the
Waypoint playtest follow-up: recovery, bulk garrison, muster controls, selection,
manpower-panel clarity, and area-based Activity summaries.

The [Garrison Many implementation record](archive/design-history-2026/garrison-many-implementation.md)
preserves the completed bulk-selection work; current behavior lives in the
[gameplay reference](game-mechanics.md).

## Templates

[`templates/README.md`](templates/README.md) provides compliant starting
points for new proposals, decisions, and recurring runbooks.

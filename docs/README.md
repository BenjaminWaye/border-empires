# Documentation Map

Status: canonical

This directory holds the repository's maintained operating knowledge. Prefer
the smallest document that answers the task at hand; source code and tests
remain authoritative for runtime behavior.

## Start here

| Need | Read |
|---|---|
| Repository-wide operating rules | [`../AGENTS.md`](../AGENTS.md) |
| Local setup, package layout, CI, and release notes | [`../README.md`](../README.md) |
| Deploying or using Fly/Vercel | [`agents/deploys.md`](agents/deploys.md) |
| Tests, debugging, and regression expectations | [`agents/testing-and-debugging.md`](agents/testing-and-debugging.md) |
| Concurrent worktree and branch safety | [`agents/concurrent-agents.md`](agents/concurrent-agents.md) |
| AI planning | [`agents/topics/ai-planner.md`](agents/topics/ai-planner.md) |
| Local gameplay verification | [`agents/topics/agent-gameplay-testing.md`](agents/topics/agent-gameplay-testing.md) |
| Current gameplay rules | [`game-mechanics.md`](game-mechanics.md) |
| Current manpower and resource-slot rules | [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md) |
| Adding a structure | [`adding-a-structure-playbook.md`](adding-a-structure-playbook.md) |

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
- Prefer links to a canonical source over copying its rules into a plan.
- When an active proposal ships, update the canonical reference and archive or
  remove the implementation plan in the same follow-up.
- Before retiring a document, check inbound links and update them. Git history
  remains the recovery path for obsolete execution detail.

## Historical records

[`archive/README.md`](archive/README.md) indexes completed investigations and
superseded plans. Archive documents are context only, never current execution
instructions.

## Current improvement plan

[`agent-work-readiness-plan.md`](agent-work-readiness-plan.md) tracks the
repository's documentation and agent-workflow cleanup in phases.

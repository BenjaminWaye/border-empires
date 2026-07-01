# Topic Runbooks And Task Notes

Use short per-topic runbooks to avoid repeated repo rediscovery. A good runbook points to entrypoints, commands, hazards, and recent decisions. It should not become a design essay.

## Location

Store recurring agent runbooks under `docs/agents/topics/`:

- `docs/agents/topics/<topic>.md`

Use one topic per recurring work area, for example:

- `rewrite-stack.md`
- `ai-planner.md`
- `client-map.md`
- `deploys-staging.md`
- `postgres-persistence.md`

## Existing runbooks

| File | Covers |
|---|---|
| `docs/agents/topics/staging-access.md` | Network/proxy access to staging from a remote session (reachability check, allowlist vs. paste-log fallback) |
| `docs/agents/topics/fly-logs-debugging.md` | Fly log/metric debugging for staging + prod: key log lines, exit_code=137 playbook, SQLite prod probe, event-loop-blocked correlation, death-forensics retention gap, common freeze causes |

## Template

````md
# <Topic>

## Scope

What this runbook covers and what it does not cover.

## Entry Points

- `path/to/file.ts`: why it matters
- `path/to/test.test.ts`: focused regression target

## Common Commands

```bash
pnpm --filter <package> test -- <focused-test>
```

## Invariants

- Rules that must not be broken.
- Package or runtime boundaries to respect.

## Recent Decisions

- Date or PR number: concise decision and reason.

## Known Pitfalls

- Failure mode and how to recognize it.
````

## Maintenance rules

- Keep each runbook under roughly 150 lines.
- Prefer pointers to canonical docs over duplicating architecture.
- Update the runbook when a task caused more than one round of rediscovery.
- Delete stale commands or paths as soon as they stop working.
- For one-off investigations, put notes in the PR/body or issue instead of creating a runbook.

## How agents should use them

Before broad search, check whether a matching topic runbook exists. Read only the relevant runbook, then use targeted `rg` and small file slices from there.

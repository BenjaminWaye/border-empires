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
| `docs/agents/topics/staging-access.md` | Reading logs/metrics from staging inside a remote session; proxy constraints; freeze diagnosis |
| `docs/agents/topics/load-harness.md` | Nightly load harness: why it runs against a local DB fixture instead of staging, how to publish a fresher fixture snapshot |
| `docs/agents/topics/staging-login-cpu-contention.md` | Staging login-probe failures / SIM_UNAVAILABLE under heavy AI load: thread model, PSI/isolated-repro diagnostic technique, fixes tried, next levers if it recurs |

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

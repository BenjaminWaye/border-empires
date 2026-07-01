# Staging Access

## Scope

How to read logs and metrics from the staging server (`border-empires-combined-staging`)
from inside a Claude Code remote session. Does NOT cover production access or deploys.

## Constraints

Network/CLI access to `fly.io`, `api.fly.io`, and `staging.borderempires.com` varies by
**session type**:

- **Container sessions running on the user's own machine** (e.g. this repo's local Claude
  Code container) typically share the user's filesystem and PATH — `flyctl` may already be
  installed at `~/.fly/bin/flyctl` and the hosts directly reachable. Check first:
  `which flyctl && curl -sm5 -o /dev/null -w '%{http_code}\n' https://fly.io` — if that
  returns a flyctl path and an HTTP code, skip straight to using it normally.
- **Fully isolated cloud/remote sessions** (spun up via a separate sandboxed environment,
  no access to the user's local files) may sit behind an egress proxy that blocks these
  hosts by default. Options A–C below are for that case.

Do not assume the proxy is blocking you — verify reachability first. Asserting a blanket
"blocked by default" across all session types is wrong and wastes a debugging cycle.

## Option A — Proxy allowlist (isolated cloud sessions only, preferred for interactive debugging)

Ask the user (or session admin) to add these hosts to the egress policy before starting the session:

```
fly.io
api.fly.io
staging.borderempires.com
```

Once allowed, install the CLI and use it normally:

```bash
curl -fsSL https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
flyctl auth token   # paste FLY_API_TOKEN from your local machine
fly logs -a border-empires-combined-staging --no-tail -n 200
fly ssh console -a border-empires-combined-staging
```

## Option B — Paste logs into the session

Quickest workaround when the proxy can't be changed, and works regardless of session type
since it requires no network access from the session at all. From your local machine:

```bash
fly logs -a border-empires-combined-staging --no-tail -n 300 2>&1 | pbcopy
```

Then paste into the chat. The simulation emits structured JSON log lines; look for:

- `utilityWinner` / `utilityWinnerScore` — what the AI chose and its score
- `noCommandReason` — why the AI emitted no command (`wait_and_recover`, `development_process_limit`, etc.)
- `phase: "request_plan_round_trip"` — confirms the planner is actually running

## Metrics, log-line reference, and freeze diagnosis

For the full grep-able log line reference, Prometheus metric names, the
exit_code=137 playbook, the SQLite prod probe, and the common freeze-cause table
(applies to staging and production alike), see
`docs/agents/topics/fly-logs-debugging.md`.

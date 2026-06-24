# Staging Access

## Scope

How to read logs and metrics from the staging server (`border-empires-combined-staging`)
from inside a Claude Code remote session. Does NOT cover production access or deploys.

## Constraints

The session egress proxy blocks `fly.io`, `api.fly.io`, and `staging.borderempires.com`
by default. Without an allowlist change or a token + proxy permission, you cannot reach
staging directly. The fly CLI also cannot be installed (the installer comes from fly.io).

## Option A — Proxy allowlist (preferred for interactive debugging)

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

## Option B — FLY_API_TOKEN + API calls

If the proxy blocks fly.io but the user can inject a token, call the Fly Machines REST API
directly (no binary needed):

```bash
# List recent log lines via the Fly Nats log stream (requires token + api.fly.io access)
curl -s -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.fly.io/v1/apps/border-empires-combined-staging/logs?limit=100" | jq .
```

This still requires `api.fly.io` to be reachable.

## Option C — Paste logs into the session

Quickest workaround when the proxy can't be changed. From your local machine:

```bash
fly logs -a border-empires-combined-staging --no-tail -n 300 2>&1 | pbcopy
```

Then paste into the chat. The simulation emits structured JSON log lines; look for:

- `utilityWinner` / `utilityWinnerScore` — what the AI chose and its score
- `noCommandReason` — why the AI emitted no command (`wait_and_recover`, `development_process_limit`, etc.)
- `sim_barbarian_*` — barbarian job counters
- `phase: "request_plan_round_trip"` — confirms the planner is actually running

## Key metrics to check

Staging exposes Prometheus metrics on `:50052/metrics` internally. From `fly ssh console`:

```bash
curl -s http://127.0.0.1:50052/metrics | grep -E "ai_commands|barbarian|utility_winner|tick"
```

Useful counters:
- `sim_ai_commands_total` — increments each time the AI submits a command
- `sim_barbarian_attack_total` — increments each time the barbarian job fires
- `sim_ai_tick_duration_seconds` — histogram of AI tick times

A flat counter after several minutes = the loop or job is frozen.

## Common freeze causes

| Symptom | Likely cause |
|---|---|
| Both AI and barbarians frozen | Season ticker stopped early (check `season ended — gameplay tickers stopped` in logs) or worker thread crash |
| AI only frozen, barbarians moving | AI tick loop crash or `tickInFlight` stuck true |
| AI expanding but not attacking | `frontPosture` stuck on `CONTAIN`; check `pressureAttackScore` and `incomePerMinute` — ATTACK needs posture `BREAK` which requires either `pressureThreatensCore` or `pressureAttackScore ≥ 180` AND `incomePerMinute ≥ 10` |
| Barbarians only frozen | `system-job-barbarian-planner` job not scheduled |

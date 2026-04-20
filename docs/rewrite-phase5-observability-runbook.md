# Rewrite Phase 5 Observability Runbook

## Metrics endpoints

- Gateway: `GET /metrics` on the existing HTTP service (default local `http://127.0.0.1:3101/metrics`).
- Simulation: dedicated metrics HTTP service (default local `http://127.0.0.1:50052/metrics`).

Both endpoints emit Prometheus text exposition for the Phase 5 gate metrics.

## Fly log-stream alert wiring

Use Fly log streams and the alert checker script to enforce Phase 5 thresholds.

- Gateway event-loop alert (3 consecutive samples over 100ms):

```bash
fly logs -a border-empires-gateway | node scripts/rewrite-phase5-alert-check.mjs gateway
```

- Simulation backlog / RSS alerts:

```bash
fly logs -a border-empires-simulation | node scripts/rewrite-phase5-alert-check.mjs simulation
```

Thresholds:

- `gateway_event_loop_max_ms > 100` for 3 consecutive samples.
- `sim_human_interactive_backlog_ms > 500`.
- `sim_checkpoint_rss_mb > 400`.

## Nightly load harness output

Run:

```bash
node scripts/rewrite-load-harness.mjs
```

This writes a dated result file to:

- `docs/load-results/YYYY-MM-DD.json`

The harness drives synthetic frontier load via `scripts/rewrite-local-soak.mjs` for 30 minutes by default, scrapes gateway/simulation metrics throughout, and fails non-zero when any Phase 5 gate is red.

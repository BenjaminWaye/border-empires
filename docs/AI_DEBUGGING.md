# AI Player Debugging Guide

## Quick Overview

Use these endpoints to inspect AI player state, commands, and metrics during development and production debugging.

## Authentication

Admin endpoints require the `ADMIN_API_TOKEN`. Find it:
- **Local**: `~/.zshrc` or `~/.zshenv` (if set)
- **Staging/Prod**: `flyctl secrets list -a border-empires-combined-staging` (or prod app name)

Use it as a Bearer token:
```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" https://border-empires-combined-staging.fly.dev/admin/debug/ai
```

---

## Endpoints

### `/admin/players` – Player State Snapshot
**GET** `/admin/players`  
**Auth**: Requires admin token

Returns basic resource state for all players:
- `gold` – Current gold in storage
- `incomePerMinute` – Economy generation rate
- `settledTiles` / `ownedTiles` – Territory control
- `techs` – Tech count
- `manpower`, `food`, `iron`, `crystal`, `supply` – Resource reserves
- `isAi` – Boolean flag

**Use when**: Checking resource levels, economy health, territory distribution.

```json
{
  "ok": true,
  "players": [
    {
      "id": "ai-1",
      "name": "Alden Vale",
      "isAi": true,
      "gold": 15760.80,
      "incomePerMinute": 125,
      "settledTiles": 42,
      "ownedTiles": 87,
      "techs": 5,
      "manpower": 500,
      "food": 200,
      "iron": 150,
      "crystal": 100,
      "supply": 300
    }
  ]
}
```

---

### `/admin/debug/ai` – AI Command History + Resources
**GET** `/admin/debug/ai`  
**Auth**: Requires admin token

Returns AI players with their last 5 commands and current state:
- `recentCommands` – Last 5 commands with type, ID, and timestamp
- Combined with resource state from `/admin/players`

**Use when**: Debugging AI decision-making, checking for stuck/silent AIs, verifying command execution.

---

### `/admin/debug/ai/decisions` – Decision-Making Diagnostics
**GET** `/admin/debug/ai/decisions?playerId=ai-1`  
**Auth**: Requires admin token

Returns detailed decision-scoring history for debugging wait_and_recover loops:
- `scores` – Score for each decision class (EXPAND, ATTACK, MUSTER, BUILD_DEFENSE, BUILD_ECONOMY, CHOOSE_TECH, WAIT)
- `winner` – Which decision won and its score
- `frontierState` – Counts of frontier opportunities: neutral, economic, town-support, scout, enemy, barbarian
- Resource state: gold, manpower, dev slot availability
- `canExpand` / `canAttack` flags

**Use when**: AI is stuck in wait_and_recover with no commands. Shows exactly which decision classes scored 0 and why.

Example: If `canExpand: false` and all EXPAND-related conditions zero, you'll see why expansion is blocked.

```json
{
  "ok": true,
  "aiPlayers": [
    {
      "playerId": "ai-1",
      "name": "Alden Vale",
      "gold": 15760.80,
      "incomePerMinute": 125,
      "settledTiles": 42,
      "ownedTiles": 87,
      "techs": 5,
      "recentCommands": [
        {
          "type": "BUILD_FORT",
          "commandId": "cmd-abc123",
          "issuedAt": 1720863456123
        },
        {
          "type": "SET_MUSTER",
          "commandId": "cmd-def456",
          "issuedAt": 1720863450000
        }
      ]
    }
  ]
}
```

---

### `/admin/runtime/metrics` – Prometheus Metrics
**GET** `/admin/runtime/metrics`  
**Auth**: Public (proxied from sim loopback)

Prometheus-format metrics including AI diagnostics:
- `sim_ai_autopilot_player_count` – Number of active AI players
- `sim_ai_noop_total` – AI commands by type (WAIT, SET_MUSTER, BUILD_FORT, ATTACK, etc.)
  - Grouped by player and action; high WAIT count = idle/waiting AI
- `sim_event_loop_blocked_total` – Main thread blocking events
- `sim_snapshot_export_ms` – Snapshot export duration

**Use when**: Checking AI health, event loop pressure, command type distribution.

Example grep for AI metrics:
```bash
curl -s http://localhost:8080/admin/runtime/metrics | grep sim_ai
```

Output:
```
sim_ai_autopilot_player_count 5
sim_ai_noop_total{player="ai-1",type="WAIT"} 45000
sim_ai_noop_total{player="ai-1",type="SET_MUSTER"} 1200
sim_ai_noop_total{player="ai-1",type="BUILD_FORT"} 1100
sim_ai_noop_total{player="ai-1",type="ATTACK"} 300
```

---

## Debugging Workflow

### AI is idle / not taking actions
1. Check `/admin/players` → `gold`, `incomePerMinute` (resource starvation?)
2. Check `/admin/debug/ai` → `recentCommands` (last action timestamp)
3. Check `/admin/runtime/metrics` → `sim_ai_noop_total{type="WAIT"}` (% WAIT commands)

**Common causes**:
- Blocked waiting for resources (low income)
- Blocked in planner (waiting for next planning window)
- Stuck in wait_and_recover loop (see `sim_ai_noop_total`)

### AI commands not applying
1. Check `/admin/debug/ai` → `recentCommands` (were commands issued?)
2. Check command type in metrics → compare issued vs. accepted counts
3. Check logs for rejection reasons

### AI resource economy broken
1. Check `/admin/players` → `incomePerMinute`, resource reserves
2. Check whether settled/owned tiles are reasonable for that AI
3. Check `/admin/runtime/metrics` → main thread lag (can starve economic calculations)

---

## Notes

- **Busy Dev Slots**: Not exported via Prometheus; only visible in logs or if instrumented separately
- **Command latency**: `recentCommands` timestamps are issue time, not acceptance time
- **Metrics delay**: Prometheus metrics may lag 30–60 seconds in practice
- **Admin token**: Required for `/admin/players` and `/admin/debug/ai`; `/admin/runtime/metrics` is proxied and publicly available

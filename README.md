# Border Empires

Live at **[play.borderempires.com](https://play.borderempires.com)**.  
Staging: [staging.borderempires.com](https://staging.borderempires.com).

## Short Description

Border Empires is a browser-based multiplayer territory strategy game where you expand tile-by-tile, fight border wars, develop your economy, level through tech branches, and race to one of five victory conditions each season.

## Game Overview

Border Empires is a persistent-world 2D tile conquest game built around territorial positioning and economic pressure rather than unit micromanagement.

Each player controls a civilization that starts from a single land tile, expands into adjacent neutral land, and attacks neighboring enemy tiles. Combat resolves through ownership transitions, not unit battles.

### World and Terrain

- The world is a toroidal grid (wrap-around edges) seeded fresh each season with a unique world seed.
- **Terrain types**: `LAND` (claimable), `SEA` / `COASTAL_SEA` (barrier, crossable only via docks or aether bridges), `MOUNTAIN` (barrier, mutable via aether abilities).
- The map style in production is island-heavy, making docks and maritime control strategically critical.
- Tiles can carry resource tags (farms, iron hills, crystal deposits, etc.) that drive economic specialization.

### Economy

- **Gold** is the primary currency, earned passively from settled tiles scaled by town tier and structure modifiers.
- **Strategic resources** — Food, Iron, Crystal, Supply, Shard, Oil — are collected from resource tiles and consumed by structures, techs, and late-game monuments.
- **Towns** are the economic backbone. Each town has a population tier (Settlement → Metropolis), a manpower pool that regenerates over time, and a support system: if a town goes unfed, gold income pauses until support recovers.
- **Manpower** is empire-wide and scarce. Attacks spend from this shared pool; a depleted empire cannot afford sustained warfare.

### Territory and Combat

- **Expand**: claim an adjacent neutral tile after a short frontier lock (`FRONTIER_CLAIM_MS`).
- **Attack**: target an adjacent enemy tile; combat resolves after a 3-second lock. The origin tile risks counter-capture on a failed assault.
- **Defense** scales with exposure — how surrounded a tile is by friendly tiles. Forts multiply the manpower cost to crack a tile by 5×–20×.
- **Mustering** (combat advance): stage manpower on a frontier, then execute a coordinated multi-tile push rather than a single-tile click.
- Frontier actions can originate from dock-linked tiles and aether-bridged tiles, extending geographic reach beyond adjacency.

### Structures

- One structure per tile, placed only on settled owned land.
- **Economic**: Farmstead, Camp, Mine, Granary, Market, Bank, Synthesizers, Fuel Plant, Caravanary, Foundry, Governance structures.
- **Military**: Fort, Siege Outpost, Observatory (extends vision and provides protection against aether abilities).
- **Monuments** (late-game, four-stage builds costing Shards): Imperial Exchange, World Engine, Aegis Dome, Astral Dock.
- Structure unlocks are tech-gated. Costs scale with how many of that type you already own.

### Tech and Research

- One active research at a time, costing gold + strategic resources + time.
- The tech tree is a DAG; contents can vary per season (seasonal tech config).
- Techs unlock structures, grant stat multipliers (attack, defense, income, vision), or grant ability access.

### Barbarians

- Barbarian tiles are seeded far from player spawns at world gen. They activate when a non-barbarian player becomes adjacent.
- Barbarian tiles attack nearby players and can multiply or walk based on accumulated progress. Recapturing a tile clears its progress.

### Strategic Layers

- **Forts**: build-timed defensive structures; destroyed on capture.
- **Docks**: paired sea-crossing gateways with cooldown and defensive value. Maritime Supremacy victory path scores from dock control.
- **Clusters**: regional resource concentrations that grant threshold-based bonuses.
- **Alliances**: mutual relationships that block friendly-fire and affect diplomatic victory scoring.
- **Truces**: non-aggression pacts (12h or 24h). Breaking a truce inflicts an attack penalty and cooldown.
- **Shard rain**: scheduled world events scattering high-value shard sites with a 30-minute TTL, feeding monument construction.

### Victory Conditions

Five concurrent paths, all requiring a 24-hour hold:

| Path | Condition |
|---|---|
| Town Control | Own ≥50% of all towns |
| Economic Hegemony | Lead world income/min by ≥33% and produce ≥200 gold/min |
| Resource Monopoly | Own ≥80% of tiles of one resource type |
| Maritime Supremacy | Own ≥55% of world docks (min 3) |
| Diplomatic Dominance | Your alliance bloc owns ≥66% of claimable land; you are its largest member |

### Seasons

- Seasons are time-bounded instances. Account identity, cosmetics, and history persist across resets; territory and progression do not.
- Each season rotates world seed, active tech tree config, cluster placement, and dock positions.
- Seasonal leaderboards track territory, points, and victory outcomes.

### Client

- Real-time Canvas map with pan/zoom, fog of war, and chunk streaming.
- HUD panels for missions, tech, alliances, leaderboard, activity feed, and identity settings.
- Mobile-first: touch pan/pinch-zoom and drawer navigation wired to live game state.
- In-game changelog popup surfaces user-facing changes each release.

---

## Run

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

`pnpm dev` builds `@border-empires/shared` then starts `apps/realtime-gateway`, `apps/simulation`, and `packages/client` in parallel.

- Client: http://localhost:5173
- Gateway health: http://localhost:3101/health

For a durable SQLite-backed local world with 20 AI players:

```bash
pnpm rewrite:restart:20ai
```

The helper writes to `./.local-data/border-empires-20ai.db` by default. Override with `SQLITE_PATH=...`. For a fresh seed instead of recovery:

```bash
pnpm rewrite:restart:20ai:seed
```

---

## Local CI

Run the full local gate from a clean worktree:

```bash
pnpm ci:local
```

This runs `pnpm check:file-lines`, builds `@border-empires/shared`, lints, tests, and builds each workspace package in a fixed order.

**File-line gate**: new source files must be 500 lines or fewer; files at or below 500 lines may not cross 500; files already over 500 may not grow. Split before adding logic to an oversized file.

Install the pre-push git hook:

```bash
./scripts/setup-git-hooks.sh
```

---

## Worktrees

Keep repo-managed worktrees inside the checkout at `.codex-worktrees/`:

```bash
pnpm worktree:new fix-some-issue
```

Creates `agent/fix-some-issue` at `.codex-worktrees/fix-some-issue` and runs `pnpm install --frozen-lockfile`.

After a PR merges, remove the worktree and branch before marking the task done. See `AGENTS.md` for the full cleanup checklist and branch discipline rules.

---

## Client Release Notes

When shipping a user-facing client update, update `packages/client/src/client-changelog.ts` in the same branch:

- Bump the changelog `version` so users who already saw the previous release only see the popup for the new release.
- Each entry: `introducedIn`, `title`, `why`, `changes`.
- Write both why the change was made and what changed.
- `pnpm check:client-changelog` fails when product code changes on a branch without a changelog update and version bump.

---

## Deploy

Production (`play.borderempires.com`) and staging (`staging.borderempires.com`) both run the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined`.

- Production Fly app: `border-empires-combined` (`fly.combined.toml`)
- Staging Fly app: `border-empires-combined-staging` (`fly.combined.staging.toml`)
- Client: Vercel project `border-empires-client`

**Deploy to staging:**
```bash
pnpm deploy:staging:all
```

**Deploy to production** (requires a passing prod-shape gate against a live snapshot):
```bash
pnpm deploy:prod:all
```

Full deploy procedures, safety requirements, prod-shape gate workflow, Vercel env scopes, and Fly escape hatches are documented in `docs/agents/deploys.md`. Read that before any deploy or Fly/Vercel CLI work.

### Environment Variables (key runtime knobs)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_GATEWAY_WS_URL` | `ws://localhost:3101/ws` | Client WebSocket target |
| `SIMULATION_SQLITE_PATH` | `/data/border-empires.db` | Simulation DB path |
| `SIMULATION_AI_PLAYER_COUNT` | `5` | AI player count per season |
| `SIMULATION_CHECKPOINT_MAX_RSS_MB` | `700` | Defer checkpoint above this RSS |
| `SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB` | `480` | Defer checkpoint above this heap |

---

## Staging Ops

**Login latency SLO probe** (AUTH → INIT, target ≤5s p95):

```bash
STAGING_LOGIN_PROBE_AUTH_TOKEN="<firebase-id-token>" pnpm ops:staging:login-probe
```

Runs 12 real WebSocket auth attempts against `wss://border-empires-combined-staging.fly.dev/ws`. Prints per-attempt outcomes plus p50/p95/p99. Exits non-zero when success rate < 100% or p95 > 5000ms.

**Env drift check** (staging Fly secrets vs. checked-in toml):

```bash
pnpm ops:staging:drift-check
```

Exits non-zero on any drift, including stale secret overrides.

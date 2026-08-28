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
- Tiles can carry resource tags (farms, titanium hills, crystal deposits, etc.) that drive economic specialization.

### Economy

- **Manpower** is the empire's primary resource, funding every physical action: expanding, settling, building structures, and attacking. It regenerates over time from an empire-wide pool sized by town population tier; a depleted empire cannot afford sustained expansion or warfare.
- **Gold** is narrow and tech-focused: it funds research, a handful of abilities that still carry a gold cost (Aether Purge, Terrain Shaping, Airport Bombard, World Engine Strike), and *rush-buys* — paying gold to instantly finish an in-progress manpower-gated build or settle. Passive gold income comes from settled tiles, scaled by town tier and structure modifiers.
- **Strategic resources** — Food, Titanium, Crystal, Umbrite — are permanent slot allocations, not stockpiles: a structure or town either has a free slot backed by an owned resource tile (or a synthesizer) or it goes **dormant** (loses its effect, but isn't destroyed) until a slot frees up. A floating badge and detail-panel line flag dormant tiles and which resource they're missing.
- **Shard** remains flow-collected (including from scheduled shard-rain events) and funds monument construction.
- **Crystal-costing player abilities** (Reveal Empire, Survey Sweep, Aether Purge/Bridge/Wall, Siphon, Aegis Lock, Astral Dock Launch, World Engine Strike, Airport Bombard, Create/Remove Mountain) are free of any Crystal cost — gated on cooldown only; a few still carry a gold cost.
- **Synthesizers** (Umbrite/Titanium Works/Crystal) are the one exception that keeps a gold upkeep and a hard 1-slot cap with no upgrade path — the deliberate trade-off that keeps "tall" play (few tiles, deep development) viable against "wide" (raw tile count).
- **Towns** are the economic backbone. Each town has a population tier (Settlement → Metropolis) and a support system: if a town goes unfed, gold income pauses until support recovers.

### Territory and Combat

- **Expand**: claim an adjacent neutral tile after a short frontier lock (`FRONTIER_CLAIM_MS`), spending manpower. An unsettled frontier claim has zero defense until settled.
- **Attack**: target an adjacent enemy tile; combat resolves after a 3-second lock, spending manpower. The origin tile risks counter-capture on a failed assault.
- **Defense** scales with exposure — how surrounded a tile is by friendly tiles. Forts multiply the manpower cost to crack a tile by 5×–20×.
- **Mustering** (combat advance): stage manpower on a frontier, then execute a coordinated multi-tile push rather than a single-tile click.
- Frontier actions can originate from dock-linked tiles and aether-bridged tiles, extending geographic reach beyond adjacency.

### Structures

- One structure per tile, placed only on settled owned land, paid for in manpower plus a resource-slot requirement (not a resource stockpile).
- **Economic**: Farmstead, Umbrite Rig, Mine, Granary, Market, Bank, Synthesizers, Fuel Plant, Trade Nexus, Foundry, Governance structures.
- **Military**: Fort, Siege Outpost, Observatory (extends vision and provides protection against aether abilities).
- **Monuments** (late-game, four-stage builds costing Shards): Imperial Exchange, World Engine, Aegis Dome, Astral Dock. Each monument type is globally unique — only one can ever be active, world-wide, at a time. If two players finish a race for the same monument within moments of each other, the loser's investment is refunded rather than silently wasted.
- Structure unlocks are tech-gated. Costs scale with how many of that type you already own.
- A structure that loses its resource-slot backing (e.g. a captured Fort with no Titanium access) goes dormant rather than being destroyed, and resumes automatically once a slot frees up.

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
- **Truces**: non-aggression pacts (12h or 24h). Breaking a truce early locks the breaker out of requesting or accepting any new truce for 24h; the other party is unaffected.
- **Shard rain**: scheduled world events scattering high-value shard sites with a 30-minute TTL, feeding monument construction.

### Victory Conditions

Five concurrent paths, all requiring a 24-hour hold:

| Path | Condition |
|---|---|
| Town Control | Own ≥50% of all towns |
| Economic Hegemony | Lead world income/min by ≥33% and clear an absolute income floor (scaled to the current gold economy, not a fixed number) |
| Resource Monopoly | Own ≥80% of tiles of one resource type |
| Maritime Supremacy | Own ≥55% of world docks (min 3) |
| Diplomatic Dominance | Your alliance bloc owns ≥66% of claimable land; you are its largest member |

### Seasons

- Seasons are time-bounded instances. Account identity, cosmetics, and history persist across resets; territory and progression do not.
- Each season rotates world seed, active tech tree config, cluster placement, and dock positions.
- Seasonal leaderboards track territory, points, and victory outcomes.

### Client

- Real-time Canvas map with pan/zoom, fog of war, and chunk streaming.
- HUD panels for missions, tech, alliances, leaderboard, a persistent scrollable events log ("what happened while I was away"), and identity settings.
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

## Worldgen Lab

A browser-based tool for inspecting and iterating on the world generation engine without running the full game stack.

```bash
pnpm dev:lab
```

Opens at **http://localhost:5174**. The shared package is built first automatically.

**Controls**

| Panel | What it does |
|---|---|
| Map Type | Switch between `Continents` (5 large landmasses) and `Islands` (55 small blobs) |
| Seed | Enter a specific seed, randomise, or enable auto-generate on every change |
| View → Scroll Y | Pan the toroidal world vertically |
| Layers | Toggle visual overlays (see below) |
| Stats | Live tile counts, island stats, estimated towns/docks, eligible resource tile counts |
| Settlements | Estimated town and dock counts after worldgen placement passes |
| Resources | Eligible tile count per resource type |

**Layer overlays**

| Toggle | Description |
|---|---|
| Biome colors | Shows sand / coastal-sand biomes distinct from grass |
| Region tint | Tints land by region (Fertile Plains, Deep Forest, Broken Highlands, Ancient Heartland, Crystal Wastes) |
| Grass shade | Light/dark grass variation |
| Resources | 55% colour tint on each eligible resource tile: cyan = Fish, gray = Titanium, purple = Gems, bright green = Farm, dark violet = Umbrite |
| Towns | Yellow marker at each estimated town position |
| Docks | Cyan marker at one tile per significant island |

Generation runs in a Web Worker so the UI stays responsive even while the seed-refinement loop runs (up to 16 attempts for Continents mode).

---

## 3D Structure Art

> **Status: no model loader is wired up yet.** Every 3D structure in the client is
> procedural Three.js geometry (see `packages/client/src/client-map-3d-structure-*.ts`),
> and 2D art is SVG in `packages/client/public/overlays/`. Dropping a `.glb` into the
> repo today will not render. This section exists so contributors who want to start
> modelling now build to the right target — see `docs/gltf-model-pipeline-plan.md`
> for the pipeline plan.

### Format

| | |
|---|---|
| Format | **glTF 2.0 binary (`.glb`)** — one self-contained file per structure |
| Up axis | **+Y up** (glTF native; matches the scene, no conversion needed) |
| Origin | Base centre at `(0, 0, 0)`; the model sits **on** `Y = 0` (ground plane) |
| Facing | Author facing **+Z** (toward the default camera) |
| Scale | **1 world unit = 1 map tile** |
| Animation | None in v1 — motion is driven by the engine's per-instance matrix hooks |
| Contents | Meshes only. Strip cameras, lights, empties, and unused nodes on export |

### Size budget

Numbers are derived from the existing procedural structures (a tile is `1.0`; the
widest current piece is the airport runway at `0.40`, the tallest point is the
control tower cab at `~0.36`).

| Budget | Target | Hard cap |
|---|---|---|
| Footprint (X × Z) | 0.7 × 0.7 units | 0.8 × 0.8 |
| Height (Y) | 0.45 units | 0.6 |
| Triangles | ≤ 1,500 | 3,000 |
| Materials / primitives | ≤ 4 | 6 |
| File size (`.glb`) | ≤ 150 KB | 512 KB |

**Material count is the most important number here.** Each material becomes one
`InstancedMesh` draw call that is submitted every frame regardless of visibility
(slots set `frustumCulled = false`), so materials cost far more than triangles do.
Merge anything you can into a shared material; reuse a colour rather than adding a
fifth material for one small part.

Keeping inside the footprint and height caps matters because structures sit one per
tile — an oversized model visually collides with its neighbours.

### Style

The existing look is **flat-shaded, low-poly, solid-colour**: `MeshStandardMaterial`
with `flatShading: true`, hand-picked hex colours, and no textures anywhere in the
project. Match it.

- Prefer **untextured** models using per-material colour.
- If a texture is genuinely needed: a **single 256×256 power-of-two atlas** shared
  across the whole model, base colour only. No normal/roughness/metalness/AO maps.
- No smooth-shading passes or subdivision — faceted geometry is the intended style.

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

When shipping a user-facing client update, add a new entry to `packages/client/src/client-changelog/client-changelog-data.ts` (`CLIENT_CHANGELOG_ENTRIES`) in the same branch:

- Each entry: `createdAt` (`Date.now()`), `introducedIn`, `title`, `why`, `changes`.
- Entries are unordered in the source — append yours anywhere; `client-changelog.ts` sorts by `createdAt` before rendering. There's no shared `version` field, so parallel branches adding entries don't conflict.
- Write both why the change was made and what changed.
- `pnpm check:client-changelog` fails when product code changes on a branch without a new changelog entry (a new `createdAt` timestamp).

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
| `VITE_ADMIN_EMAIL` | *(unset)* | Auth email that unlocks client-side debug tooling (per-tile debug download, verbose tile logs, map-reveal UI). Set it to the same address as the gateway's `ADMIN_EMAIL` below. Unset disables the tooling entirely. |
| `ADMIN_EMAIL` (gateway) | *(unset)* | The one admin identity for gateway-side admin gates: fog-toggle permission (`canToggleFog`), and the fallback destination for bug/suggestion report emails when `GATEWAY_BUG_REPORT_EMAIL_TO` isn't set. |
| `GATEWAY_BUG_REPORT_EMAIL_TO` | falls back to `ADMIN_EMAIL` | Destination inbox for player bug reports and suggestions (Resend). Separate from `ADMIN_EMAIL` because it's a mailbox, not an identity check — set it explicitly if reports should go somewhere other than the admin's own inbox. |
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

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

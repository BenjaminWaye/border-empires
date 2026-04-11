# Border Empires (TypeScript Prototype)

Prototype MMO scaffold based on the handoff plan.

## Short Description

Border Empires is a browser-based multiplayer territory strategy game where you expand tile-by-tile, fight border wars, level through tech branches, and compete in seasonal resets with clusters, docks, and forts shaping the map meta.

## Full Description And Core Mechanics

Border Empires is a persistent-world 2D tile conquest game designed around territorial positioning rather than unit micromanagement.  
Each player controls a civilization that starts from a single land tile, expands into adjacent neutral land, and attacks neighboring enemy tiles through short lock-based combat resolution.

### World and Terrain

- The world is a toroidal grid (wrap-around edges).
- Land is playable and capturable.
- Sea and mountains are hard barriers.
- The map includes continents, inland rivers and lakes, mountain barriers, coastal zones, and resource-bearing tiles.

### Territory and Combat

- Actions originate from a controlled tile and target valid adjacent land, with dock-based crossing exceptions.
- Expand/attack actions resolve with a 3-second combat lock to prevent third-party interference.
- Defender power is amplified by a defensiveness model based on exposed border edges.
- Losing a defense can counter-capture the attacker’s origin tile.

### Progression and Scoring

- Points come from passive resource income and PvP captures.
- Underdog-friendly PvP scaling rewards defeating stronger opponents more heavily.
- Levels increase from points and grant tech picks.
- Techs are branch-locked after first root choice and apply stat modifiers/powerups.

### Strategic Layers

- **Forts:** limited, build-timed defensive structures on key border/dock tiles; destroyed on capture.
- **Docks:** paired sea-crossing gateways with cooldown and defensive value.
- **Clusters:** regional resource concentrations that grant threshold-based bonuses.
- **Alliances:** mutual relationships that affect border exposure and disallow allied farming.

### Seasons

- Seasons reset world progression while preserving account identity/cosmetics/history.
- Each season rotates strategic content (world seed, clusters, docks, active tech subset).
- Seasonal leaderboards track outcomes such as territory and points.

### Client Experience

- Real-time Canvas map with pan/zoom.
- Fog of war and chunk streaming.
- HUD panels for missions, tech, alliances, leaderboard, activity feed, and identity settings.
- Mobile-oriented interactions include touch pan/pinch zoom and panel navigation.

## Run

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

- Client: http://localhost:5173
- Server health: http://localhost:3001/health

## Local CI

Run the full local gate from a clean worktree with:

```bash
pnpm ci:local
```

This runs install, builds `@border-empires/shared` first, then lints, tests, and builds each workspace package in a fixed order so local checks are deterministic.

Install the local git hook for this checkout with:

```bash
./scripts/setup-git-hooks.sh
```

That configures `pre-push` to run `pnpm ci:local`.

## Implemented in this slice

- Monorepo (`shared`, `server`, `client`) with strict TypeScript.
- Shared core formulas: wrapping, defensiveness, rating/reward scaling, level curve.
- O(1) ownership-change exposure delta with tests + full recompute helper.
- Server: seeded world tiles, auth (`name:password` token), spawn, chunk subscribe, fog by vision radius, expand/attack, 3s combat locks, stamina, passive income, anti-repeat reward decay, elimination/respawn, snapshot persistence.
- Server: branch-locked tech picks with stat modifiers, alliance request/accept/break flow, allied-border exposure handling.
- Server: branch-locked tech picks with stat modifiers, alliance request/accept/break flow, allied-border exposure handling, action rate limiting.
- Client: Canvas map, pan/zoom, click-target capture (auto-origin from adjacent owned tiles), real-time HUD, capture progress bar, alliance controls, tech picker, tile color picker.
- New strategic layer: seasons (with rollover/reset + archive), rotating active tech tree per season, strategic resource clusters (with bonuses), paired dock crossings (cooldown + defense bonus), and forts (build timer/cost/cap + capture-destroy behavior).

## Load Simulation

With server running:

```bash
pnpm --filter @border-empires/server simulate:load
```

Optional env vars:

```bash
BOTS=80 APM=1500 DURATION_SEC=180 pnpm --filter @border-empires/server simulate:load
```

## Test Checklist

1. Start stack:
```bash
pnpm install
pnpm dev
```
2. Open two browser windows at `http://localhost:5173`.
3. In window A, login prompt: `alice:pw`.
4. In window B, login prompt: `bob:pw`.
5. Press `r` in each window to refresh nearby chunks after moving camera with arrow keys.
6. Click an adjacent neutral tile to your territory to expand (origin auto-picks from your border).
7. Click an adjacent enemy tile to attack and observe ~3 second combat result.
8. In A, enter `bob` in ally target input and click `Send`. In B, click `Accept` on incoming request.
9. Confirm alliance updates appear in feed, then try attacking allied tiles and verify it is rejected.
10. Pick a root tech in the dropdown, then pick a child tech and verify root-lock behavior (cross-root picks should fail with error).
11. Select one of your border/dock tiles and click `Build Fort On Selected`; after ~60s it becomes active.
12. Capture a fortified tile from another player and verify the fort is destroyed on capture.
13. Find dock tiles (gold outlined on map) and attack across paired docks; verify cooldown is enforced.
14. Trigger season rollover for testing: `curl -X POST http://localhost:3001/admin/season/rollover` and verify progression resets while account identity remains.

## Notes

- WebSocket schema validation uses Zod.
- Snapshot file written to `snapshots/state.json` every 30s.
- Live game shell now mirrors the Figma-export structure: top HUD strip, action rail, capture overlay, side panel, and mobile drawer navigation wired to live game state.

## Deploy (Vercel + Fly.io)

### 1) Deploy API server to Fly.io

Prereqs:

```bash
brew install flyctl
fly auth login
```

From repo root:

```bash
fly launch --copy-config --config fly.server.toml --no-deploy
fly deploy --config fly.server.toml
```

After deploy, note your API hostname, for example:

`https://border-empires-api.fly.dev`

WebSocket URL for client env:

`wss://border-empires-api.fly.dev/ws`

### 2) Deploy client to Vercel

In Vercel project settings:

- Framework: Vite
- Root Directory: `packages/client`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @border-empires/client build`
- Output Directory: `dist`

Set environment variable:

- `VITE_WS_URL=wss://border-empires-api.fly.dev/ws`

Then deploy.

### 3) Local vs Production WS config

- Local default: `ws://localhost:3001/ws`
- Override in production with `VITE_WS_URL`.

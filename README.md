# Border Empires (TypeScript Prototype)

Prototype MMO scaffold based on the handoff plan.

## Run

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

- Client: http://localhost:5173
- Server health: http://localhost:3001/health

## Implemented in this slice

- Monorepo (`shared`, `server`, `client`) with strict TypeScript.
- Shared core formulas: wrapping, defensiveness, rating/reward scaling, level curve.
- O(1) ownership-change exposure delta with tests + full recompute helper.
- Server: seeded world tiles, auth (`name:password` token), spawn, chunk subscribe, fog by vision radius, expand/attack, 3s combat locks, stamina, passive income, anti-repeat reward decay, elimination/respawn, snapshot persistence.
- Server: branch-locked tech picks with stat modifiers, alliance request/accept/break flow, allied-border exposure handling.
- Client: Canvas map, pan/zoom, select tile and expand/attack by click, real-time HUD, alliance controls, tech picker.

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
6. Click your own tile then an adjacent neutral tile to expand.
7. Click your tile then an adjacent enemy tile to attack and observe ~3 second combat result.
8. In A, enter `bob` in ally target input and click `Send`. In B, click `Accept` on incoming request.
9. Confirm alliance updates appear in feed, then try attacking allied tiles and verify it is rejected.
10. Pick a root tech in the dropdown, then pick a child tech and verify root-lock behavior (cross-root picks should fail with error).

## Notes

- WebSocket schema validation uses Zod.
- Snapshot file written to `snapshots/state.json` every 30s.
- Tech tree and alliances are scaffold-level in this slice and need full Epic D/F follow-up.

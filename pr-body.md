## Summary
Adds two missing visual features for Sky Dock Bombard:

1. **3D range overlay** — selecting an active, owned Sky Dock shows a red 3D range circle (radius 30) on the map, matching the existing Observatory/Waterworks range overlay pattern.
2. **Hit animations** — when a bombard lands, the targeted 3x3 tiles show a brief orange flash and expanding ring animation (1.5s duration).

## Changes
- `client-map-3d.ts`: Added `syncAirportRangeMarker()`, `writeAirportRangeGeometry()`, `syncBombardFxQueue()`, airport range meshes/materials, render loop integrations.
- `client-crystal-targeting.ts`: Push to `bombardFxQueue` after sending `AIRPORT_BOMBARD`.
- `client-state.ts`: Added `bombardFxQueue`.
- New: `client-map-3d-bombard-fx/` — bombard FX layer with tests.
- New: `client-map-3d-airport-range/` — regression test for range marker integration.
- Changelog bumped to `2026.06.28.3`.

## Verification
- 3 new tests pass (bombard FX spawns 9 effects, expired entries removed, range marker functions present in module).

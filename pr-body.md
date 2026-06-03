## What

The town food-upkeep entry in the tile detail panel was silently hidden for CITY, GREAT_CITY, and METROPOLIS towns when the snapshot did not carry `foodUpkeepPerMinute` in `townJson`. This was the same "thin townJson" shape that previously caused `goldPerMinute=0`.

## Fix

Added a local `townFoodUpkeepForTier` helper that mirrors the authoritative drain values from `player-update-economy.ts` (CITY 0.3, GREAT_CITY 0.6, METROPOLIS 1, TOWN 0.1). The gateway now derives food upkeep from `populationTier` instead of trusting the stored field - same backfill philosophy as the `goldPerMinute`/`cap` fallbacks.

The derived value is also injected into the re-stitched `townJson` so the client fallback in `client-tile-upkeep-view.ts` stays consistent.

## Open decision

The two existing `townFoodUpkeepPerMinute` copies disagree:
- `player-update-economy.ts` (authoritative drain): 0.3 / 0.6 / 1
- `live-snapshot-view.ts` (display/snapshot): 0.2 / 0.4 / 0.8

This PR uses the **drain** values so the UI matches actual food consumption. The snapshot copy should be reconciled separately.

## Changes

- `apps/realtime-gateway/src/tile-detail-snapshot.ts` - new `townFoodUpkeepForTier` helper, derive upkeep from tier, inject into townJson
- `apps/realtime-gateway/src/tile-detail-snapshot.test.ts` - regression tests for missing `foodUpkeepPerMinute` with CITY tier and missing `townJson` with tile town fields
- `packages/client/src/client-changelog.ts` - changelog entry

## Verification

- `pnpm --filter @border-empires/realtime-gateway test -- tile-detail-snapshot` passes (12 tests)
- `pnpm --filter @border-empires/realtime-gateway build` passes
- Full gateway tests still have 4 unrelated integration failures in profile/color paths
- `check-client-changelog-update.mjs` passes

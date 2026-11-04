import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "../runtime-types.js";
import type { buildTileYieldView } from "../tile-yield-view/tile-yield-view.js";

/** Shared arg-builder for buildTileYieldView's economyContext param. */
export const yieldViewEconomyContext = (
  player: RuntimePlayer | undefined,
  ctx: RuntimeTileYieldEconomyContext | undefined,
  tiles: ReadonlyMap<string, DomainTileState>,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  players?: ReadonlyMap<string, RuntimePlayer>
): Parameters<typeof buildTileYieldView>[2] => ({
  ...(player ? { player } : {}),
  ...(ctx ? { fedTownKeys: ctx.fedTownKeys, firstThreeTownKeys: ctx.firstThreeTownKeys } : {}),
  ...(players ? { players } : {}),
  tiles,
  dockLinksByDockTileKey
});

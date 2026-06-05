import type { DomainTileState } from "@border-empires/game-domain";
import { FORT_GARRISON_CAP_BY_VARIANT, MUSTER_SYSTEM_ENABLED } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

export type FortGarrisonTickInput = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  fortTilesByOwner: ReadonlyMap<string, Set<string>>;
  tiles: ReadonlyMap<string, DomainTileState>;
  playerManpowerCap: (player: RuntimePlayer) => number;
  playerManpowerRegenPerMinute: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

/**
 * Overflow-fill tick for fort garrisons.
 *
 * A player's "overflow" for this interval is the portion of their manpower regen
 * that would have been wasted because the pool is already at cap. That overflow is
 * split evenly across all of the player's active forts whose garrison is below cap
 * and used to fill them.
 *
 * No-op when the muster system is disabled.
 */
export const tickFortGarrison = (input: FortGarrisonTickInput): void => {
  if (!MUSTER_SYSTEM_ENABLED) return;

  for (const [playerId, fortKeys] of input.fortTilesByOwner) {
    if (fortKeys.size === 0) continue;
    const player = input.players.get(playerId);
    if (!player) continue;

    // Collect active forts that still have headroom.
    const depletedForts: Array<{ tileKey: string; tile: DomainTileState }> = [];
    for (const tileKey of fortKeys) {
      const tile = input.tiles.get(tileKey);
      if (
        !tile?.fort ||
        tile.fort.ownerId !== playerId ||
        tile.fort.status !== "active" ||
        tile.fort.garrison == null ||
        tile.fort.garrisonCap == null ||
        tile.fort.garrison >= tile.fort.garrisonCap
      ) continue;
      depletedForts.push({ tileKey, tile });
    }
    if (depletedForts.length === 0) continue;

    // Compute overflow: regen that would push the pool above cap.
    const cap = input.playerManpowerCap(player);
    if (player.manpower < cap) continue; // pool not full — no overflow this tick
    const regenPerMin = input.playerManpowerRegenPerMinute(player);
    // Use player's last manpower-update timestamp as the overflow interval start.
    // This is semantically correct: overflow = regen since the last time the
    // player's pool was updated (which is when manpower was last applied).
    const elapsedMs = input.nowMs - (player.manpowerUpdatedAt ?? input.nowMs);
    if (elapsedMs <= 0) continue;
    const overflowTotal = regenPerMin * (elapsedMs / 60_000);
    if (overflowTotal <= 0) continue;

    const sharePerFort = overflowTotal / depletedForts.length;

    for (const { tileKey, tile } of depletedForts) {
      const fort = tile.fort!;
      const headroom = fort.garrisonCap! - fort.garrison!;
      const inflow = Math.min(sharePerFort, headroom);
      if (inflow < 0.0001) continue;

      const updatedTile: DomainTileState = {
        ...tile,
        fort: {
          ...fort,
          garrison: fort.garrison! + inflow,
          garrisonUpdatedAt: input.nowMs
        }
      };
      input.replaceTileState(tileKey, updatedTile);
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `fort-garrison-tick:${tileKey}:${input.nowMs}`,
        playerId,
        tileDeltas: [input.tileDeltaFromState(updatedTile)]
      });
    }
  }
};

/** Garrison cap for a fort variant string, defaulting to the base FORT cap. */
export const garrisonCapForVariant = (variant: string | undefined): number =>
  FORT_GARRISON_CAP_BY_VARIANT[variant ?? "FORT"] ?? FORT_GARRISON_CAP_BY_VARIANT["FORT"] ?? 120;

/** Initial garrison when a fort completes construction (25% of cap). */
export const initialGarrisonForVariant = (variant: string | undefined): number =>
  garrisonCapForVariant(variant) * 0.25;

/** Build fort tile keys set key from coordinates (same as simulationTileKey). */
export const fortTileKey = (x: number, y: number): string => simulationTileKey(x, y);

// Fast refresh for a Writ of Correction (docs/house-charges-plan.md). The full
// House Charges pass runs every HOUSE_CHARGES_TICK_MIN_INTERVAL_MS (15s), so a
// House that garrisoned the rival's AFC could wait that long to see its card
// say so (owner report 2026-11-23). A Writ only changes when the House's own
// garrisoned AFCs change, and the runtime already indexes those per player, so
// each 1s tick compares that small set for every online House holding a Writ
// and re-evaluates only the Houses whose set moved.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { keptHouseCharges } from "@border-empires/shared";
import { refreshPlayerHouseCharges } from "./house-charges-ticker.js";

export type HouseChargesAfcWatchDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  /** Tile keys of the garrisoned, active AFCs a player owns (runtime summary index). */
  readonly afcTileKeys: (playerId: string) => ReadonlySet<string>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
};

export type HouseChargesAfcWatch = {
  /** Re-evaluates every watched House whose AFC set changed since the last call; returns those House ids. */
  readonly tick: (nowMs: number) => string[];
};

const keepsCorrection = (player: DomainPlayer): boolean =>
  Boolean(player.houseCharges && keptHouseCharges(player.houseCharges).some((charge) => charge.kind === "CORRECTION"));

const signatureOf = (keys: ReadonlySet<string>): string => [...keys].sort().join("|");

export const createHouseChargesAfcWatch = (deps: HouseChargesAfcWatchDeps): HouseChargesAfcWatch => {
  // Last AFC set seen per watched House; pruned every tick to online humans keeping a Writ, so bounded by online players.
  const lastSignature = new Map<string, string>();
  return {
    tick: (nowMs) => {
      const players = deps.players();
      const watched = new Set<string>();
      const refreshed: string[] = [];
      for (const [playerId, player] of players) {
        if (player.isAi || !keepsCorrection(player) || !deps.isPlayerSubscribed(playerId)) continue;
        watched.add(playerId);
        const keys = deps.afcTileKeys(playerId);
        const signature = signatureOf(keys);
        const previous = lastSignature.get(playerId);
        lastSignature.set(playerId, signature);
        // First sighting only records the set: the full pass already evaluated this House.
        if (previous === undefined || previous === signature) continue;
        const tiles = deps.tiles();
        const ownAfcTiles = (): DomainTileState[] =>
          [...keys].map((key) => tiles.get(key)).filter((tile): tile is DomainTileState => Boolean(tile?.afc));
        refreshPlayerHouseCharges(player, tiles, players, nowMs, ownAfcTiles);
        refreshed.push(playerId);
      }
      for (const playerId of [...lastSignature.keys()]) if (!watched.has(playerId)) lastSignature.delete(playerId);
      return refreshed;
    }
  };
};

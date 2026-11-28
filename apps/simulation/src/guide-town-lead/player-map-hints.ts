// A player's map pointers for PLAYER_UPDATE: relic hints (runtime-relic-map-hints.ts), the guide's
// town lead (guide-town-lead.ts) and its camp lead (scout-drone/scout-drone-camp-lead.ts), as one context field. Re-exported by runtime-relic-map-hints.ts.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { RelicMapHint } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { RelicMapHintIndex } from "../runtime-relic-map-hints.js";
import { guideTownLeadFor, type GuideTownLead } from "./guide-town-lead.js";

export type PlayerMapHintsInput = {
  player: DomainPlayer | undefined;
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  relicIndex: Pick<RelicMapHintIndex, "hintsFor">;
  neutralTileKeys: Iterable<string>;
  isExplored: (playerId: string, x: number, y: number) => boolean;
  /** The nearest live Insurgent camp the player has never seen (scout drone runtime campLeadFor). */
  campLeadFor?: (playerId: string) => GuideTownLead | undefined;
};

export type PlayerMapHints = { relicMapHints: RelicMapHint[]; guideTownLead: GuideTownLead | undefined; guideCampLead: GuideTownLead | undefined };

/** Only a human House reads the guide: AI players and Planetary Defense skip the scan on every update. */
const readsGuide = (player: DomainPlayer): boolean => !player.isAi && !player.id.startsWith("barbarian");

export const playerMapHints = (input: PlayerMapHintsInput): PlayerMapHints => {
  const { player } = input;
  if (!player) return { relicMapHints: [], guideTownLead: undefined, guideCampLead: undefined };
  const summary = input.summaryForPlayer(player.id);
  return {
    relicMapHints: input.relicIndex.hintsFor({ tiles: input.tiles, summaryForPlayer: input.summaryForPlayer }, player),
    guideTownLead: readsGuide(player)
      ? guideTownLeadFor({
          tiles: input.tiles,
          neutralTileKeys: input.neutralTileKeys,
          ownedTownTierByTile: summary.ownedTownTierByTile,
          ownedAfcTileKeys: summary.ownedAfcTileKeys,
          isExplored: (x, y) => input.isExplored(player.id, x, y)
        })
      : undefined,
    guideCampLead: readsGuide(player) ? input.campLeadFor?.(player.id) : undefined
  };
};

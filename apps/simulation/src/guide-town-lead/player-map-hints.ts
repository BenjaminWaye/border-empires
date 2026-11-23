// A player's map pointers for PLAYER_UPDATE: relic hints (runtime-relic-map-hints.ts) and the guide's
// town lead (guide-town-lead.ts), as one context field. Re-exported by runtime-relic-map-hints.ts.
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
};

/** Only a human House reads the guide: AI players and Planetary Defense skip the scan on every update. */
const readsGuide = (player: DomainPlayer): boolean => !player.isAi && !player.id.startsWith("barbarian");

export const playerMapHints = (input: PlayerMapHintsInput): { relicMapHints: RelicMapHint[]; guideTownLead: GuideTownLead | undefined } => {
  const { player } = input;
  if (!player) return { relicMapHints: [], guideTownLead: undefined };
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
      : undefined
  };
};

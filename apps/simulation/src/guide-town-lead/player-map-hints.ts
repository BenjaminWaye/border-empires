// A player's map pointers for PLAYER_UPDATE: relic hints (runtime-relic-map-hints.ts) and the guide's
// town lead (guide-town-lead.ts). One context field for both keeps runtime.ts from growing.
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
};

export const playerMapHints = (input: PlayerMapHintsInput): { relicMapHints: RelicMapHint[]; guideTownLead: GuideTownLead | undefined } => {
  const { player } = input;
  if (!player) return { relicMapHints: [], guideTownLead: undefined };
  const summary = input.summaryForPlayer(player.id);
  return {
    relicMapHints: input.relicIndex.hintsFor({ tiles: input.tiles, summaryForPlayer: input.summaryForPlayer }, player),
    guideTownLead: guideTownLeadFor({ tiles: input.tiles, neutralTileKeys: input.neutralTileKeys, ownedTownTierByTile: summary.ownedTownTierByTile, ownedAfcTileKeys: summary.ownedAfcTileKeys })
  };
};

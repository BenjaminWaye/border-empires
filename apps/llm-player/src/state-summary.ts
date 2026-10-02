// Assembles what one turn hands the LLM: player status plus a human-scale
// view of the map (see viewport.ts) instead of the full known-tile array,
// which can run to thousands of entries for a large empire.
import type { EventLogEntry } from "./game-socket.js";
import type { IntentLedger } from "./intent-ledger.js";
import { buildStructureSites, type StructureSite } from "./structures.js";
import { reachableTechChoices, type TechChoice } from "./tech-tree.js";
import {
  buildBeaconSites,
  buildMinimap,
  buildViewport,
  buildViewportFrontier,
  type BeaconSite,
  type CameraPosition,
  type FrontierTarget,
  type MinimapCell,
  type PlayerStatus,
  type TileIndex,
  type ViewportTile
} from "./viewport.js";

const MAX_RECENT_EVENTS = 8;

export type RecentEvent = { type: string; text: string; occurredAt: number; x?: number; y?: number };

export type TurnContext = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  ownedTileCount: number;
  camera: CameraPosition;
  viewport: ViewportTile[];
  minimap: MinimapCell[];
  frontier: FrontierTarget[];
  beaconSites: BeaconSite[];
  structureSites: StructureSite[];
  // Only reachable choices this player can currently afford in gold --
  // matches beaconSites/structureSites' pattern of handing the LLM a
  // pre-filtered, directly actionable list rather than the full tech tree.
  techChoices: TechChoice[];
  // Pending/resolved outcomes of the bot's own recent build/tech commands --
  // the only feedback those no-ack commands get (see intent-ledger.ts).
  recentOutcomes: string[];
  recentEvents: RecentEvent[];
};

const toRecentEvent = (entry: EventLogEntry): RecentEvent => ({
  type: entry.type,
  text: entry.text,
  occurredAt: entry.occurredAt,
  ...(entry.x !== undefined ? { x: entry.x } : {}),
  ...(entry.y !== undefined ? { y: entry.y } : {})
});

export const summarizeTurn = (
  index: TileIndex,
  status: PlayerStatus,
  camera: CameraPosition,
  eventLog: EventLogEntry[],
  intents: Pick<IntentLedger, "blocksTech" | "blocksStructure" | "summaryLines">,
  turn: number
): TurnContext => {
  let ownedTileCount = 0;
  for (const tile of index.values()) if (tile.ownerId === status.playerId) ownedTileCount += 1;

  const recentEvents = [...eventLog]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, MAX_RECENT_EVENTS)
    .map(toRecentEvent);

  return {
    playerId: status.playerId,
    playerName: status.playerName,
    gold: status.gold,
    manpower: status.manpower,
    manpowerCap: status.manpowerCap,
    manpowerRegenPerMinute: status.manpowerRegenPerMinute,
    ownedTileCount,
    camera,
    viewport: buildViewport(index, camera),
    minimap: buildMinimap(index, camera),
    frontier: buildViewportFrontier(index, camera, status.playerId),
    // Anything the ledger says is in flight (or recently rejected) is withheld
    // so the model can't re-send the same command while it's unresolved.
    beaconSites: buildBeaconSites(index, camera, status.playerId, status.resourceSlots).filter(
      (site) => !intents.blocksStructure(site.x, site.y, "RELAY_BEACON")
    ),
    structureSites: buildStructureSites(index, camera, status.playerId, status.techIds, status.resourceSlots).filter(
      (site) => !intents.blocksStructure(site.x, site.y, site.structureType)
    ),
    techChoices: reachableTechChoices(status.techIds).filter(
      (choice) => choice.goldCost <= status.gold && !intents.blocksTech(choice.id)
    ),
    recentOutcomes: intents.summaryLines(turn),
    recentEvents
  };
};

// Wire-facing types shared by game-socket.ts and the modules that consume its
// state. Split out of game-socket.ts to keep that file under the repo's
// 500-line cap (and so wire-parsers.ts can depend on types without importing
// the socket class).
import type { EconomicStructureType, SlotResource } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// §5 (docs/manpower-economy-rewrite-plan.md): FOOD/TITANIUM/CRYSTAL/UMBRITE
// build costs are retired as a stockpile spend (strategicResources) -- a
// structure needing one of these permanently occupies a SLOT instead
// (packages/shared/src/structure-slots/structure-slots.ts), gated by a
// global per-resource supply/demand pool. This is the same precomputed pair
// the server's own hasFreeResourceSlots gates BUILD_STRUCTURE on
// (packages/sim-protocol/src/index.ts's doc comment on `resourceSlots`).
// strategicResources itself isn't tracked here -- SHARD is the only key it
// still governs (monument assembly), and monuments are out of scope for
// this bot (see structures.ts's doc comment).
export type ResourceSlots = { supply: Record<SlotResource, number>; demand: Record<SlotResource, number> };

// Shared by every eligibility check that needs a real free-slot count
// (structures.ts's hasFreeSlots, viewport.ts's buildBeaconSites) so the
// supply-minus-demand formula can't quietly drift between them.
export const freeResourceSlotCount = (resourceSlots: ResourceSlots, resource: SlotResource): number =>
  resourceSlots.supply[resource] - resourceSlots.demand[resource];

export type GameTile = PlayerSubscriptionSnapshot["tiles"][number];
export type EventLogEntry = NonNullable<PlayerSubscriptionSnapshot["player"]>["eventLog"] extends
  | Array<infer Entry>
  | undefined
  ? Entry
  : never;

// One entry of the server's domainCatalog (INIT / TECH_UPDATE / DOMAIN_UPDATE),
// reduced to what eligibility needs. Domains are a permanent, mutually
// exclusive pick per tier (apps/simulation/src/tech-domain-bridge/).
export type DomainOption = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  goldCost: number;
  // Strategic-resource stockpile cost (SHARD for tier 2+; tier 1 is gold only).
  resourceCost: Record<string, number>;
  // True for domains that make the player pick a trickle resource up front
  // (Clockwork Stipend) -- the bot doesn't send that sub-choice.
  needsResourceChoice: boolean;
};

export type DomainState = {
  domainIds: string[];
  // Server's list of ids currently open to pick (next tier, not yet owned).
  openChoiceIds: string[];
  catalog: DomainOption[];
  // Strategic-resource stockpile (SHARD is the one domain costs use).
  strategicResources: Record<string, number>;
};

export type GameInitState = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  manpowerCap: number;
  // Base is MANPOWER_BASE_REGEN_PER_MINUTE (packages/shared/src/config.ts) --
  // ~0.2/min, i.e. ~12h to refill an empty pool from scratch. Town
  // population growth raises this (and the cap), so read the live value
  // here rather than assuming the base rate.
  manpowerRegenPerMinute: number;
  tiles: GameTile[];
  // §20 durable "what happened while I was away" feed (see
  // packages/sim-protocol/src/index.ts) -- most-recent-last, deduplicated by
  // id since it's unclear from the wire alone whether a later PLAYER_UPDATE
  // resends the full log or only new entries; merging by id is correct
  // either way.
  // Always the server's latest full log for this player (already capped
  // server-side), not something to accumulate across updates -- see
  // packages/client/src/client-network/client-network.ts's identical
  // `state.eventLog = incomingEventLog` full-replace handling.
  eventLog: EventLogEntry[];
  // Server-computed candidates (town/dock/resource/town-ring FRONTIER tiles
  // in reach) for the "Auto-settle" mechanic -- the real browser client
  // drains this itself by firing ordinary SETTLE commands
  // (packages/client/src/client-development-queue/client-development-queue.ts's
  // applyAutoSettlementQueueFromServer), budget-gated by manpower; a human
  // player never manually settles these. Always the server's latest full
  // queue (see client-network.ts's identical handling), not something to
  // accumulate across updates.
  autoSettlementQueue: Array<{ x: number; y: number }>;
  // Researched tech ids. Only refreshed via a TECH_UPDATE event (fires after
  // a CHOOSE_TECH round-trip, or other progression changes) -- unlike
  // eventLog/autoSettlementQueue this is NOT part of PLAYER_UPDATE (see
  // packages/client/src/client-network/client-network.ts's separate
  // TECH_UPDATE handler), so a session that never sees one keeps whatever
  // INIT reported.
  techIds: string[];
  // The real gate for FOOD/TITANIUM/CRYSTAL/UMBRITE structure eligibility --
  // see ResourceSlots's doc comment. Refreshed via PLAYER_UPDATE.
  resourceSlots: ResourceSlots;
  // Refreshed by TECH_UPDATE/DOMAIN_UPDATE.
  domains: DomainState;
};

export type BotAction =
  | { type: "EXPAND"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "ATTACK"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "SETTLE"; x: number; y: number };

// Separate from BotAction: BUILD_ECONOMIC_STRUCTURE carries no commandId in
// its own schema (packages/shared/src/messages/messages.ts), and the gateway
// only forwards commandId/clientSeq for commands it dispatches with
// withMetadata=true (SETTLE, RUSH_BUY, ...) -- BUILD_ECONOMIC_STRUCTURE isn't
// one of them (apps/realtime-gateway/src/gateway-app/gateway-app.ts, same for
// CHOOSE_TECH below). So unlike sendAction() neither call can be matched to
// an ACTION_ACCEPTED/ERROR by id. A rejection still reaches us as an ERROR
// tagged with a server-generated commandId (captured via
// drainUnmatchedErrors) and success shows up in state; intent-ledger.ts ties
// the two back to the call. structureType is typed broadly (any
// EconomicStructureType) at this wire layer; which types the bot actually
// offers the LLM is a curated allowlist decided in structures.ts, not here.
export type BuildEconomicStructureAction = { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: EconomicStructureType };
export type ChooseTechAction = { type: "CHOOSE_TECH"; techId: string };
// chosenTrickleResource is deliberately not part of this action: domains that
// need that sub-choice are never offered (see domains.ts).
export type ChooseDomainAction = { type: "CHOOSE_DOMAIN"; domainId: string };
export type FireAndForgetAction = BuildEconomicStructureAction | ChooseTechAction | ChooseDomainAction;

export type UnmatchedError = { commandId: string; receivedAt: number; code: string; message: string };

export type CommandResult = { outcome: "accepted" } | { outcome: "error"; code: string; message: string };

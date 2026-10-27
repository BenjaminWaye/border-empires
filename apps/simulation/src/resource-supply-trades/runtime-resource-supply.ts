import { revealedResourceValueForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { isSiphonModeSabotage, NETWORK_RESOURCES, UPKEEP_TRADE_RESOURCES, TRADABLE_SUPPLY_RESOURCES,
  type NetworkSiteCounts, type ResourceSupplyAgreement, type ResourceSupplyFlow, type ResourceSupplyOffer } from "@border-empires/shared";
import { networkSupplyWithSiphon } from "./network-supply-with-siphon.js";
import { resourceSlotDemandForPlayer, type ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { ResourceSupplyLedger, type ResourceSupplyLedgerContext, type SupplyLedgerResult } from "./resource-supply-ledger.js";

export interface RuntimeResourceSupplyContext {
  cachedPlayerState?: (id:string) => import("@border-empires/shared").ResourceSupplyPlayerState | undefined;
  cachePlayerState?: (id:string,state:import("@border-empires/shared").ResourceSupplyPlayerState) => void;
  now(): number;
  player(id: string): RuntimePlayer | undefined;
  ownedTiles(id: string): DomainTileState[];
  physicalUpkeep(id: string): ResourceSlotTotals;
  siphonCasterIds?: () => Iterable<string>;
  siphonedTiles?: (id: string) => readonly DomainTileState[];
  networkUsed(id: string, sites: NetworkSiteCounts): NetworkSiteCounts;
  tileSettledAtByKey: ReadonlyMap<string, number>;
  beforeChange: ResourceSupplyLedgerContext["beforeChange"];
  invalidate: ResourceSupplyLedgerContext["invalidate"];
  changed: ResourceSupplyLedgerContext["changed"];
  capacityRejected?: () => void;
  publish?: (participantIds: readonly string[]) => void;
}

/** Supply rights are continuing commitments. Domestic output, never imports,
 * backs exports. All allocation state is bounded by the ledger's agreement cap. */
export class RuntimeResourceSupply {
  readonly ledger: ResourceSupplyLedger;
  constructor(private readonly ctx: RuntimeResourceSupplyContext, restored: readonly ResourceSupplyAgreement[] = []) {
    this.ledger = new ResourceSupplyLedger({ ...ctx, capacityFor: (id, phase, flows) =>
      phase === "upkeep" ? ctx.physicalUpkeep(id) : this.physicalNetwork(id, flows) }, restored);
  }
  private physicalNetwork(id: string, flows: ReadonlyMap<string, ResourceSupplyFlow>): NetworkSiteCounts {
    return networkSupplyWithSiphon({ ...this.ctx,
      effectiveUpkeep: ownerId => this.applyUpkeep(this.ctx.physicalUpkeep(ownerId), flows.get(ownerId)),
      siphonedTiles: ownerId => this.ctx.siphonedTiles?.(ownerId) ?? [] }, id);
  }
  private applyUpkeep(physical: ResourceSlotTotals, flow?: ResourceSupplyFlow): ResourceSlotTotals {
    const result = { ...physical };
    for (const resource of UPKEEP_TRADE_RESOURCES) result[resource] = Math.max(0, result[resource] + (flow?.incoming[resource] ?? 0) - (flow?.outgoing[resource] ?? 0));
    return result;
  }
  upkeep(id: string): ResourceSlotTotals {
    return this.applyUpkeep(this.ctx.physicalUpkeep(id), this.ledger.allocation(this.ctx.now()).flows.get(id));
  }
  network(id: string): NetworkSiteCounts {
    const flows = this.ledger.allocation(this.ctx.now()).flows, flow = flows.get(id);
    const sites = this.physicalNetwork(id, flows);
    for (const resource of NETWORK_RESOURCES) sites[resource] = Math.max(0, sites[resource] + (flow?.incoming[resource] ?? 0) - (flow?.outgoing[resource] ?? 0));
    return sites;
  }
  available(id: string): ResourceSupplyOffer {
    const flows = this.ledger.allocation(this.ctx.now()).flows, flow = flows.get(id), tiles = this.ctx.ownedTiles(id), player = this.ctx.player(id);
    const physical = { ...this.ctx.physicalUpkeep(id), ...this.physicalNetwork(id, flows) };
    const effective = { ...this.applyUpkeep(this.ctx.physicalUpkeep(id), flow), ...this.network(id) };
    const demand = { ...resourceSlotDemandForPlayer(tiles, id, player ? slotWaiversForPlayer(player) : undefined, this.ctx.tileSettledAtByKey),
      ...this.ctx.networkUsed(id, this.network(id)) };
    const result: ResourceSupplyOffer = {};
    for (const resource of TRADABLE_SUPPLY_RESOURCES) {
      if (resource !== "FOOD" && !revealedResourceValueForPlayer(resource, player)) continue;
      const spare = Math.min(10_000, Math.max(0, Math.floor(Math.min(physical[resource] - (flow?.outgoing[resource] ?? 0), effective[resource] - demand[resource]))));
      if (spare) result[resource] = spare;
    }
    return result;
  }
  create(row: ResourceSupplyAgreement): SupplyLedgerResult {
    for (const [id, offer] of [[row.proposerId, row.proposerGives], [row.targetId, row.targetGives]] as const) {
      const available = this.available(id);
      if (TRADABLE_SUPPLY_RESOURCES.some(resource => (offer[resource] ?? 0) > (available[resource] ?? 0)))
        return { ok: false, message: "The promised resource slots are already in use or committed to another deal." };
    }
    return this.ledger.add(row, this.ctx.now());
  }
  playerState(id: string): import("@border-empires/shared").ResourceSupplyPlayerState {
    const allocation = this.ledger.allocation(this.ctx.now());
    const cached = this.ctx.cachedPlayerState?.(id);
    if (cached) return cached;
    const state = { resourceTradeHoldings: this.available(id), effectiveResourceSupply: this.upkeep(id), effectiveNetworkSupply: this.network(id),
      resourceTradeAgreements: this.ledger.rows().filter(row => row.proposerId === id || row.targetId === id)
        .map(row => ({ ...row, fulfilled: allocation.fulfilled.has(row.id) })) };
    this.ctx.cachePlayerState?.(id,state);return state;
  }
  private playerSupplyParticipants(id: string): readonly string[] {
    const participants = this.ledger.participantIds();
    // The existing tower index bounds this search; never scan a source owner's territory.
    const casters = [...(this.ctx.siphonCasterIds?.() ?? participants)].filter(casterId =>
      this.ctx.siphonedTiles?.(casterId).some(tile => tile.ownerId === id));
    if (!casters.length && !participants.includes(id) && !this.ctx.siphonedTiles?.(id).length) return [];
    return this.ledger.affectedParticipantIds([id, ...casters]);
  }
  playerWillChange(id: string): void {
    const ids = this.playerSupplyParticipants(id);
    if (ids.length) { this.ledger.advanceTo(this.ctx.now()); this.ctx.beforeChange(this.ctx.now(), ids); }
  }
  playerDidChange(id: string): void {
    const ids = this.playerSupplyParticipants(id);
    if (ids.length) { this.ledger.invalidate(); this.ctx.invalidate(ids); this.ctx.publish?.(ids); }
  }
  private affectedTileParticipants(previous: DomainTileState | undefined, next: DomainTileState): readonly string[] {
    const seeds = [previous?.ownerId, next.ownerId,
      isSiphonModeSabotage(previous?.sabotage) ? previous.sabotage.ownerId : undefined,
      isSiphonModeSabotage(next.sabotage) ? next.sabotage.ownerId : undefined].filter((id): id is string => Boolean(id));
    const dependents = seeds.flatMap(id => this.playerSupplyParticipants(id));
    return this.ledger.affectedParticipantIds([...seeds, ...dependents]);
  }
  private affectsSupply(previous: DomainTileState | undefined, next: DomainTileState): boolean {
    const directCasters = [previous?.sabotage, next.sabotage].flatMap(stamp => isSiphonModeSabotage(stamp) ? [stamp.ownerId] : []);
    if (!this.ledger.size && !directCasters.length &&
        ![...(this.ctx.siphonCasterIds?.() ?? [])].some(id => this.ctx.siphonedTiles?.(id).length)) return false;
    const relevant = (tile: DomainTileState | undefined): boolean => Boolean(tile && (tile.resource || tile.town || tile.economicStructure || tile.fort || tile.observatory || tile.siegeBattery || tile.naturalWonder || tile.waystation));
    if (!relevant(previous) && !relevant(next)) return false;
    if (previous && previous.ownerId === next.ownerId && previous.ownershipState === next.ownershipState &&
        previous.resource === next.resource && previous.town?.populationTier === next.town?.populationTier &&
        previous.economicStructure === next.economicStructure && previous.fort === next.fort &&
        previous.observatory === next.observatory && previous.siegeBattery === next.siegeBattery &&
        previous.naturalWonder === next.naturalWonder && previous.waystation === next.waystation && previous.sabotage === next.sabotage) return false;
    const participants = this.ledger.participantIds();
    const affected = this.affectedTileParticipants(previous, next);
    return participants.some(id => affected.includes(id)) || directCasters.length > 0 ||
      affected.some(id => Boolean(this.ctx.siphonedTiles?.(id).length));
  }
  sourceWillChange(previous: DomainTileState | undefined, next: DomainTileState): void {
    if (this.affectsSupply(previous, next)) {
      this.ledger.advanceTo(this.ctx.now());
      this.ctx.beforeChange(this.ctx.now(), this.affectedTileParticipants(previous, next));
    }
  }
  sourceDidChange(previous: DomainTileState | undefined, next: DomainTileState): void {
    if (this.affectsSupply(previous, next)) {
      this.ledger.invalidate(); this.ctx.invalidate(this.affectedTileParticipants(previous, next));
    }
  }
  sourceChangesPublished(previous: DomainTileState | undefined, next: DomainTileState): void {
    if (this.affectsSupply(previous, next)) {
      // Structure/siphon indices are now current; refresh allocations rebuilt
      // by intermediate tile-yield reads before publishing either player's view.
      this.ledger.invalidate(); this.ctx.invalidate(this.affectedTileParticipants(previous, next)); this.ctx.publish?.(this.affectedTileParticipants(previous, next));
    }
  }
  cancel(id: string, actorId: string): SupplyLedgerResult {
    const row = this.ledger.rows().find(row => row.id === id);
    if (row && row.proposerId !== actorId && row.targetId !== actorId) return {ok:false,message:"Only a House in this agreement can end its supply."};
    this.ledger.remove(id,this.ctx.now()); return {ok:true};
  }
  cancelRefunded(id: string, proposerId: string, targetId: string): void {
    const row = this.ledger.rows().find(row => row.id === id);
    if (row && row.proposerId === proposerId && row.targetId === targetId) this.ledger.remove(id, this.ctx.now());
  }
}

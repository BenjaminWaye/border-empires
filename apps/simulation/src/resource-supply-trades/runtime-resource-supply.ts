import { tradedSlotSources } from "./traded-slot-sources.js";
import type { ResourceSlotSupplyBuild } from "../runtime-economy-caches/runtime-economy-caches.js";
import { revealedResourceValueForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";
import type { DomainTileState, PersonalActivitySupplyEndedReason } from "@border-empires/game-domain";
import { BINDING_DEAL_MESSAGE, TRUCE_PLEDGE_ID_PREFIX, hasResourceSupplyOffer, emptyNetworkSiteCounts, isSiphonModeSabotage, NETWORK_RESOURCES, OFFERABLE_SUPPLY_RESOURCES, UPKEEP_TRADE_RESOURCES,
  offerIncludesNonTradableSupply, type NetworkSiteCounts, type ResourceSupplyAgreement, type ResourceSupplyFlow, type ResourceSupplyOffer } from "@border-empires/shared";
import { networkSupplyWithSiphon } from "./network-supply-with-siphon.js";
import { supplyShortfallMessage } from "./supply-shortfall-message.js";
import { resourceSlotDemandForPlayer, type ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { ResourceSupplyLedger, type ResourceSupplyLedgerContext, type SupplyLedgerResult } from "./resource-supply-ledger.js";

export interface RuntimeResourceSupplyContext {
  cachedPlayerState?: (id:string) => import("@border-empires/shared").ResourceSupplyPlayerState | undefined;
  cachePlayerState?: (id:string,state:import("@border-empires/shared").ResourceSupplyPlayerState) => void;
  now(): number;
  coinAccountingStartsAt?: number;
  journalSeasonId?: string | undefined;
  resourceSlotSources?: (id: string) => import("@border-empires/shared").ResourceSlotSources | undefined;
  player(id: string): RuntimePlayer | undefined;
  ownedTiles(id: string): DomainTileState[];
  physicalUpkeep(id: string): ResourceSlotTotals;
  siphonCasterIds?: () => Iterable<string>;
  siphonedTiles?: (id: string) => readonly DomainTileState[];
  tileSettledAtByKey: ReadonlyMap<string, number>;
  beforeChange: ResourceSupplyLedgerContext["beforeChange"];
  invalidate: ResourceSupplyLedgerContext["invalidate"];
  changed: ResourceSupplyLedgerContext["changed"];
  capacityRejected?: () => void;
  publish?: (participantIds: readonly string[]) => void;
  /** A deal ended for real: cancelled by a House in it, by an attack between them, or run out. */
  ended?: (agreement: ResourceSupplyAgreement, reason: PersonalActivitySupplyEndedReason, byPlayerId?: string) => void;
}

/** Supply rights are continuing commitments. Domestic output, never imports,
 * backs exports. All allocation state is bounded by the ledger's agreement cap. */
export type ResourceTradeJournalCursor = { journalSequence: number; journalSeasonId?: string };

export class RuntimeResourceSupply {
  readonly ledger: ResourceSupplyLedger;
  private journalSequence: number;
  constructor(private readonly ctx: RuntimeResourceSupplyContext, restored: readonly ResourceSupplyAgreement[] = [], journalSequence = 0) {
    this.journalSequence = journalSequence;
    // Salvage is never exported: zero capacity suspends any legacy salvage deal.
    this.ledger = new ResourceSupplyLedger({ ...ctx, nameOf: id => ctx.player(id)?.name, changed: (...args) => {
      const [action, agreement] = args;
      ctx.changed(...args);
      if (action === "expired") ctx.ended?.(agreement, "EXPIRED");
    }, capacityFor: (id, phase, flows) =>
      phase === "upkeep" ? ctx.physicalUpkeep(id) : { ...this.physicalNetwork(id, flows), PRECURSOR_SALVAGE: 0 } }, restored);
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
  upkeepWithSources(id: string, physical: ResourceSlotSupplyBuild): ResourceSlotSupplyBuild {
    const flow = this.ledger.allocation(this.ctx.now()).flows.get(id);
    return { totals: this.applyUpkeep(physical.totals, flow), sources: tradedSlotSources(physical.sources, flow) };
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
    // Every developed frontier site can be pledged: trading one costs the
    // supplier that site's marginal value rather than idle spare capacity.
    const demand = { ...emptyNetworkSiteCounts(), ...resourceSlotDemandForPlayer(tiles, id, player ? slotWaiversForPlayer(player) : undefined, this.ctx.tileSettledAtByKey) };
    const result: ResourceSupplyOffer = {};
    for (const resource of OFFERABLE_SUPPLY_RESOURCES) {
      if (resource !== "FOOD" && !revealedResourceValueForPlayer(resource, player)) continue;
      const spare = Math.min(10_000, Math.max(0, Math.floor(Math.min(physical[resource] - (flow?.outgoing[resource] ?? 0), effective[resource] - demand[resource]))));
      if (spare) result[resource] = spare;
    }
    return result;
  }
  nextJournalCursor(): ResourceTradeJournalCursor {
    this.journalSequence += 1;
    return {
      journalSequence: this.journalSequence,
      ...(this.ctx.journalSeasonId ? { journalSeasonId: this.ctx.journalSeasonId } : {})
    };
  }

  snapshotState(): { resourceSupplyAgreements?: readonly ResourceSupplyAgreement[]; resourceSupplyJournalSequence?: number } {
    const agreements = this.ledger.rows();
    return {
      ...(agreements.length ? { resourceSupplyAgreements: agreements } : {}),
      ...(this.journalSequence ? { resourceSupplyJournalSequence: this.journalSequence } : {})
    };
  }
  create(row: ResourceSupplyAgreement, targetCoinDelta?: number): SupplyLedgerResult {
    if (offerIncludesNonTradableSupply(row.proposerGives) || offerIncludesNonTradableSupply(row.targetGives))
      return { ok: false, message: "Precursor salvage can't be traded." };
    // The agreement limit is reported before a slot shortfall: it can't be fixed by finding spare slots.
    const full = this.ledger.capacityRefusal(row);
    if (full) { this.ctx.capacityRejected?.(); return { ok: false, message: full }; }
    for (const [id, offer] of [[row.proposerId, row.proposerGives], [row.targetId, row.targetGives]] as const) {
      const shortfall = supplyShortfallMessage(this.ctx.player(id)?.name ?? id, offer, this.available(id));
      if (shortfall) return { ok: false, message: shortfall };
    }
    return this.ledger.add(row, this.ctx.now(), targetCoinDelta);
  }
  playerState(id: string): import("@border-empires/shared").ResourceSupplyPlayerState {
    const allocation = this.ledger.allocation(this.ctx.now());
    const cached = this.ctx.cachedPlayerState?.(id);
    if (cached) return cached;
    const sources = this.ctx.resourceSlotSources?.(id);
    const state = { ...(sources ? { effectiveResourceSources: sources } : {}), resourceTradeHoldings: this.available(id), effectiveResourceSupply: this.upkeep(id), effectiveNetworkSupply: this.network(id),
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
  sourceWillChange(previous: DomainTileState | undefined, next: DomainTileState): ReadonlySet<string> | undefined {
    if (!this.affectsSupply(previous, next)) return undefined;
    const now = this.ctx.now();
    this.ledger.advanceTo(now);
    this.ctx.beforeChange(now, this.affectedTileParticipants(previous, next));
    return this.ctx.ended && this.ledger.size ? this.ledger.allocation(now).fulfilled : undefined;
  }
  sourceDidChange(previous: DomainTileState | undefined, next: DomainTileState): void {
    if (this.affectsSupply(previous, next)) {
      this.ledger.invalidate(); this.ctx.invalidate(this.affectedTileParticipants(previous, next));
    }
  }
  sourceChangesPublished(previous: DomainTileState | undefined, next: DomainTileState, fulfilledBefore?: ReadonlySet<string>): void {
    if (this.affectsSupply(previous, next)) {
      // Structure/siphon indices are now current; refresh allocations rebuilt
      // by intermediate tile-yield reads before publishing either player's view.
      const ids = this.affectedTileParticipants(previous, next);
      this.ledger.invalidate();
      this.ctx.invalidate(ids);
      if (fulfilledBefore?.size) {
        const { suspended } = this.ledger.allocation(this.ctx.now());
        if (suspended.size) {
          for (const row of this.ledger.rows()) {
            if (fulfilledBefore.has(row.id) && suspended.has(row.id)) this.ctx.ended?.(row, "SUSPENDED");
          }
        }
      }
      this.ctx.publish?.(ids);
    }
  }
  cancel(id: string, actorId: string): SupplyLedgerResult {
    const row = this.ledger.rows().find(row => row.id === id);
    if (row && row.proposerId !== actorId && row.targetId !== actorId) return {ok:false,message:"Only a House in this agreement can end its supply."};
    // Deals are binding for their term, as in Civ: only expiry or war (cancelBetween) ends one early.
    // Open-ended agreements saved before terms existed have nothing to honour and may still be ended.
    if (row?.expiresAt !== undefined) return {ok:false,message:BINDING_DEAL_MESSAGE};
    if (row && this.ledger.remove(id, this.ctx.now())) this.ctx.ended?.(row, "CANCELLED", actorId);
    return {ok:true};
  }
  /** Ends every agreement between two Houses, in both directions, through the
   * ordinary cancel path (settle both at the old rates, then drop the supply).
   * Returns how many agreements ended. Used when one House attacks the other. */
  cancelBetween(playerAId: string, playerBId: string): number {
    // Hot path (every accepted ATTACK): most worlds hold no agreements at all.
    if (playerAId === playerBId || this.ledger.size === 0) return 0;
    const rows = this.ledger.rows().filter(row =>
      (row.proposerId === playerAId && row.targetId === playerBId) ||
      (row.proposerId === playerBId && row.targetId === playerAId));
    let ended = 0;
    for (const row of rows) if (this.ledger.remove(row.id, this.ctx.now())) {
      ended += 1;
      this.ctx.ended?.(row, "ATTACK", playerAId);
    }
    return ended;
  }
  /**
   * A truce's slot-free Coin pledge is the price of that truce: when the truce
   * ends early (broken, or ended any other way), its pledges between the two
   * Houses end with it. Binding supply deals are untouched.
   */
  endTrucePledgesBetween(playerAId: string, playerBId: string, actorId: string): number {
    if (playerAId === playerBId || this.ledger.size === 0) return 0;
    let ended = 0;
    for (const row of this.ledger.rows()) {
      const between = (row.proposerId === playerAId && row.targetId === playerBId) || (row.proposerId === playerBId && row.targetId === playerAId);
      if (!between || !row.id.startsWith(TRUCE_PLEDGE_ID_PREFIX) || hasResourceSupplyOffer(row.proposerGives) || hasResourceSupplyOffer(row.targetGives)) continue;
      if (this.ledger.remove(row.id, this.ctx.now())) { ended += 1; this.ctx.ended?.(row, "CANCELLED", actorId); }
    }
    return ended;
  }
  cancelRefunded(id: string, proposerId: string, targetId: string, targetCoinDelta?: number): boolean {
    const row = this.ledger.rows().find(row => row.id === id);
    if (!row || row.proposerId !== proposerId || row.targetId !== targetId) return false;
    return this.ledger.remove(id, this.ctx.now(), targetCoinDelta);
  }
}

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { RuntimeState } from "./runtime/runtime-state.js";
import { computeShardRainWelcomeNotice } from "./runtime-shard-rain-rules.js";
import { emitShardRainHelloFor, tickShardRain, type ShardRainRuntimeInput } from "./runtime-shard-rain-tick.js";
import { TerritoryPeakTracker } from "./shard-rain-comeback/shard-rain-comeback.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

/** What shard rain reads from and writes to the simulation runtime. */
export interface RuntimeShardRainDeps {
  readonly state: Pick<RuntimeState, "players" | "tiles">;
  now(): number;
  replaceTileState(tileKey: string, tile: DomainTileState): void;
  emitEvent(event: SimulationEvent): void;
  tileDeltaFromState(tile: DomainTileState): SimulationTileWireDelta;
  territoryTileKeysForPlayer(playerId: string): ReadonlySet<string>;
}

/**
 * The live shard-rain event's bookkeeping: the current wave's site count and
 * expiry, which schedule slots already spawned or warned, recently used and
 * currently active FALL sites, the per-player hello dedup and the decaying
 * territory peaks behind comeback rain. All of it is derived state: boot
 * rebuilds the wave from the snapshot's FALL sites through
 * recordRecoveredFallSite, the peaks rebuild from live territory, and
 * nothing here is persisted.
 */
export class RuntimeShardRain {
  private lastSpawnSlotKey: string | undefined;
  private lastWarningSlotKey: string | undefined;
  private tickCounter = 0;
  private currentExpiresAt: number | undefined;
  private currentSiteCount = 0;
  private readonly lastHelloByPlayer = new Map<string, number>();
  private readonly recentTileKeys = new Set<string>();
  private readonly activeFallSiteKeys = new Set<string>();
  private readonly territoryPeaks = new TerritoryPeakTracker();
  private readonly input: ShardRainRuntimeInput;

  constructor(deps: RuntimeShardRainDeps) {
    const rain = this;
    this.input = {
      now: () => deps.now(),
      get players() { return deps.state.players; },
      get tiles() { return deps.state.tiles; },
      recentShardRainTileKeys: this.recentTileKeys,
      activeShardFallSiteKeys: this.activeFallSiteKeys,
      lastShardRainHelloByPlayer: this.lastHelloByPlayer,
      territoryPeaks: this.territoryPeaks,
      territoryTileKeysForPlayer: (playerId) => deps.territoryTileKeysForPlayer(playerId),
      getCurrentShardRainExpiresAt: () => rain.currentExpiresAt,
      setCurrentShardRainExpiresAt: (expiresAt) => { rain.currentExpiresAt = expiresAt; },
      getCurrentShardRainSiteCount: () => rain.currentSiteCount,
      setCurrentShardRainSiteCount: (siteCount) => { rain.currentSiteCount = siteCount; },
      getLastShardRainSpawnSlotKey: () => rain.lastSpawnSlotKey,
      setLastShardRainSpawnSlotKey: (slotKey) => { rain.lastSpawnSlotKey = slotKey; },
      getLastShardRainWarningSlotKey: () => rain.lastWarningSlotKey,
      setLastShardRainWarningSlotKey: (slotKey) => { rain.lastWarningSlotKey = slotKey; },
      incrementShardRainTickCounter: () => {
        rain.tickCounter += 1;
        return rain.tickCounter;
      },
      replaceTileState: (tileKey, tile) => deps.replaceTileState(tileKey, tile),
      emitEvent: (event) => deps.emitEvent(event),
      tileDeltaFromState: (tile) => deps.tileDeltaFromState(tile)
    };
  }

  tick(nowMs: number): void {
    tickShardRain(this.input, nowMs);
  }

  /**
   * Runs a command in which the player gives up land themselves (UNCAPTURE_TILE)
   * and forgives whatever territory it cost, cut-offs included, so it never
   * counts toward comeback rain.
   */
  runVoluntaryLoss(playerId: string, run: () => void): void {
    const before = this.input.territoryTileKeysForPlayer(playerId).size;
    run();
    const lost = before - this.input.territoryTileKeysForPlayer(playerId).size;
    if (lost > 0) this.territoryPeaks.forgive(playerId, lost, this.input.now());
  }

  emitHelloFor(playerId: string, nowMs: number): void {
    emitShardRainHelloFor(this.input, playerId, nowMs);
  }

  welcomeNotice(nowMs: number): Record<string, unknown> {
    return computeShardRainWelcomeNotice({
      nowMs,
      currentSiteCount: this.currentSiteCount,
      currentExpiresAt: this.currentExpiresAt
    });
  }

  /** Boot: count a still-live FALL site from the recovered snapshot into the current wave. */
  recordRecoveredFallSite(tileKey: string, expiresAt: number): void {
    this.currentSiteCount += 1;
    this.currentExpiresAt = typeof this.currentExpiresAt === "number" ? Math.max(this.currentExpiresAt, expiresAt) : expiresAt;
    this.activeFallSiteKeys.add(tileKey);
  }

  /** A site of the current wave was collected; returns how many remain. */
  decrementSiteCount(): number {
    this.currentSiteCount = Math.max(0, this.currentSiteCount - 1);
    return this.currentSiteCount;
  }

  clearExpiry(): void {
    this.currentExpiresAt = undefined;
  }

  clearHellos(): void {
    this.lastHelloByPlayer.clear();
  }
}

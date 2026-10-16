import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { RuntimeState } from "./runtime/runtime-state.js";
import { computeShardRainWelcomeNotice } from "./runtime-shard-rain-rules.js";
import { emitShardRainHelloFor, tickShardRain, type ShardRainRuntimeInput } from "./runtime-shard-rain-tick.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

/** What shard rain reads from and writes to the simulation runtime. */
export interface RuntimeShardRainDeps {
  readonly state: Pick<RuntimeState, "players" | "tiles">;
  now(): number;
  replaceTileState(tileKey: string, tile: DomainTileState): void;
  emitEvent(event: SimulationEvent): void;
  tileDeltaFromState(tile: DomainTileState): SimulationTileWireDelta;
}

/**
 * The live shard-rain event's bookkeeping: the current wave's site count and
 * expiry, which schedule slots already spawned or warned, recently used and
 * currently active FALL sites, and the per-player hello dedup. All of it is
 * derived state: boot rebuilds it from the snapshot's FALL sites through
 * recordRecoveredFallSite, and nothing here is persisted.
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

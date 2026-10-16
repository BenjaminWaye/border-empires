// Periodic Aether Tower shield work, run from simulation-service.ts's 1s
// watchtower ticker (at most once a second, each run's cost bounded): Siphon's tower-comes-back-online end
// (SiphonModeLifecycle.sweepShieldReturns) and the per-player AETHER_SHIELDS
// push (aether-shield-broadcast.ts). Both exist because a tower's cooldown
// running out, or its power coming and going, changes whether it shields
// without writing any tile, so nothing event-driven ever sees it.
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { collectShieldingTowers, type ObservatoryDormancyCheck } from "./aether-shield.js";
import { AetherShieldBroadcaster, type AetherShieldsPayload } from "./aether-shield-broadcast.js";

// Under the 1s ticker period on purpose: the caller's Date.now() lands a
// variable few ms into each interval callback (after the watchtower tick), so
// consecutive runs can be measured as e.g. 996ms apart. A floor equal to the
// period would then skip every such run and stretch the cadence to 2s.
export const AETHER_SHIELD_TICK_MIN_INTERVAL_MS = 900;

export type AetherShieldTickDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly activeObservatoriesByOwner: () => ReadonlyMap<string, ReadonlySet<string>>;
  readonly players: () => ReadonlyMap<string, { readonly isAi?: boolean | undefined }>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly forEachVisibleKey: (viewerId: string, visit: (tileKey: string) => void) => void;
  readonly hasFullVision: (viewerId: string) => boolean;
  readonly isStructureDormant: ObservatoryDormancyCheck;
  readonly sweepShieldReturns: (towerKeys: Iterable<string>, commandId: string) => number;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: AetherShieldsPayload) => void;
};

export type AetherShieldTicker = {
  /** No-op until AETHER_SHIELD_TICK_MIN_INTERVAL_MS has passed since the last run. */
  readonly tick: (nowMs: number) => void;
  /** Push `playerId` their current AETHER_SHIELDS list now (live subscribe). */
  readonly sendTo: (playerId: string, nowMs: number) => void;
};

export const createAetherShieldTicker = (deps: AetherShieldTickDeps): AetherShieldTicker => {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let clockMs = 0;
  const broadcaster = new AetherShieldBroadcaster({
    get tiles() {
      return deps.tiles();
    },
    viewerIds: function* () {
      for (const [playerId, player] of deps.players()) if (!player.isAi && deps.isPlayerSubscribed(playerId)) yield playerId;
    },
    shieldingTowers: () => collectShieldingTowers(deps.activeObservatoriesByOwner(), deps.tiles(), clockMs, deps.isStructureDormant),
    forEachVisibleKey: deps.forEachVisibleKey,
    hasFullVision: deps.hasFullVision,
    emitPlayerMessage: deps.emitPlayerMessage
  });
  return {
    tick: (nowMs) => {
      if (nowMs - lastRunAt < AETHER_SHIELD_TICK_MIN_INTERVAL_MS) return;
      lastRunAt = nowMs;
      clockMs = nowMs;
      const towerKeys: string[] = [];
      for (const keys of deps.activeObservatoriesByOwner().values()) towerKeys.push(...keys);
      deps.sweepShieldReturns(towerKeys, `aether-shield-sweep:${nowMs}`);
      broadcaster.tick();
    },
    sendTo: (playerId, nowMs) => {
      clockMs = nowMs;
      broadcaster.sendTo(playerId);
    }
  };
};

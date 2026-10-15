// Periodic Aether Tower shield work, run from simulation-service.ts's 1s
// watchtower ticker and throttled here: Siphon's tower-comes-back-online end
// (SiphonModeLifecycle.sweepShieldReturns) and the per-player AETHER_SHIELDS
// push (aether-shield-broadcast.ts). Both exist because a tower's cooldown
// running out, or it leaving dormancy, changes whether it shields without
// writing any tile, so nothing event-driven ever sees it.
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { collectShieldingTowers, type ObservatoryDormancyCheck } from "./aether-shield.js";
import { AetherShieldBroadcaster, type AetherShieldsPayload } from "./aether-shield-broadcast.js";

export const AETHER_SHIELD_TICK_MIN_INTERVAL_MS = 3_000;

export type AetherShieldTickDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly activeObservatoriesByOwner: () => ReadonlyMap<string, ReadonlySet<string>>;
  readonly players: () => ReadonlyMap<string, { readonly isAi?: boolean | undefined }>;
  readonly isPlayerSubscribed: (playerId: string) => boolean;
  readonly isVisible: (viewerId: string, tileKey: string) => boolean;
  readonly hasFullVision: (viewerId: string) => boolean;
  readonly isStructureDormant: ObservatoryDormancyCheck;
  readonly sweepShieldReturns: (towerKeys: Iterable<string>, commandId: string) => number;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: AetherShieldsPayload) => void;
};

/** Returns the tick function; each call is a no-op until AETHER_SHIELD_TICK_MIN_INTERVAL_MS has passed since the last run. */
export const createAetherShieldTicker = (deps: AetherShieldTickDeps): ((nowMs: number) => void) => {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let tickNow = 0;
  const broadcaster = new AetherShieldBroadcaster({
    get tiles() {
      return deps.tiles();
    },
    viewerIds: function* () {
      for (const [playerId, player] of deps.players()) if (!player.isAi && deps.isPlayerSubscribed(playerId)) yield playerId;
    },
    shieldingTowers: () => collectShieldingTowers(deps.activeObservatoriesByOwner(), deps.tiles(), tickNow, deps.isStructureDormant),
    isVisible: deps.isVisible,
    hasFullVision: deps.hasFullVision,
    emitPlayerMessage: deps.emitPlayerMessage
  });
  return (nowMs) => {
    if (nowMs - lastRunAt < AETHER_SHIELD_TICK_MIN_INTERVAL_MS) return;
    lastRunAt = nowMs;
    tickNow = nowMs;
    const towerKeys: string[] = [];
    for (const keys of deps.activeObservatoriesByOwner().values()) towerKeys.push(...keys);
    deps.sweepShieldReturns(towerKeys, `aether-shield-sweep:${nowMs}`);
    broadcaster.tick(nowMs);
  };
};

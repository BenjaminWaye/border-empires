import { AFC_SPECIALIZATION_BALANCE, AFC_CAMPAIGN_RECORD_LIMIT } from "@border-empires/shared";
import { activeTruceBetween, pairKey, type SocialActionResult, type SocialActiveTruce, type SocialPlayerRecord, type SocialStateSink } from "./social-state-types.js";

export const forcedTruceDiagnostics = { cooldownEntries: 0, capacityRejections: 0 };
interface ForcedTruceDependencies {
  now: () => number;
  playersById: ReadonlyMap<string, SocialPlayerRecord>;
  trucesByPair: Map<string, SocialActiveTruce>;
  initial?: readonly { playerId: string; cooldownUntil: number }[];
  sink?: SocialStateSink | undefined;
  ok: (playerIds: string[], announcements?: Partial<Record<string, string>>) => SocialActionResult;
}
export function createForcedTruces(deps: ForcedTruceDependencies): {
  force: (playerId: string, targetPlayerId: string) => SocialActionResult;
  cooldownUntil: (playerId: string) => number;
  reset: () => void;
} {
  const cooldowns = new Map((deps.initial ?? []).filter(entry => entry.cooldownUntil > deps.now()).map(entry => [entry.playerId, entry.cooldownUntil]));
  if (cooldowns.size > AFC_CAMPAIGN_RECORD_LIMIT) throw new Error("Forced-truce cooldown recovery exceeds capacity");
  const prune = (): void => {
    for (const [id, until] of cooldowns) if (until <= deps.now()) cooldowns.delete(id);
    forcedTruceDiagnostics.cooldownEntries = cooldowns.size;
  };
  prune();
  return {
    reset: () => { cooldowns.clear(); for (const [key, truce] of deps.trucesByPair) if (truce.origin === "court") deps.trucesByPair.delete(key); forcedTruceDiagnostics.cooldownEntries = 0; },
    cooldownUntil: playerId => { prune(); return cooldowns.get(playerId) ?? 0; },
    force(playerId, targetPlayerId) {
      prune();
      const actor = deps.playersById.get(playerId);
      const target = deps.playersById.get(targetPlayerId);
      if (!actor || !target || actor.id === target.id || target.id.startsWith("barbarian-")) return { ok: false, code: "FORCED_TRUCE_INVALID", message: "select another House in this campaign" };
      if ((cooldowns.get(playerId) ?? 0) > deps.now()) return { ok: false, code: "FORCED_TRUCE_COOLDOWN", message: "your Court Armistice Mandate is recharging" };
      if (activeTruceBetween(playerId, targetPlayerId, deps.trucesByPair, deps.now())) return { ok: false, code: "TRUCE_EXISTS", message: "you already have an active truce with that House" };
      if (cooldowns.size >= AFC_CAMPAIGN_RECORD_LIMIT) {
        forcedTruceDiagnostics.capacityRejections += 1;
        return { ok: false, code: "SOCIAL_CAPACITY", message: "Court registration is temporarily unavailable" };
      }
      const now = deps.now();
      const truce: SocialActiveTruce = { playerAId: playerId < targetPlayerId ? playerId : targetPlayerId, playerBId: playerId < targetPlayerId ? targetPlayerId : playerId,
        startedAt: now, endsAt: now + AFC_SPECIALIZATION_BALANCE.forcedTruceDurationMs, createdByPlayerId: playerId, origin: "court" };
      const cooldownUntil = now + AFC_SPECIALIZATION_BALANCE.forcedTruceCooldownMs;
      // One durable transaction commits the truce and its cooldown before publishing either.
      deps.sink?.saveForcedTruce(truce, cooldownUntil);
      deps.trucesByPair.set(pairKey(playerId, targetPlayerId), truce);
      cooldowns.set(playerId, cooldownUntil);
      forcedTruceDiagnostics.cooldownEntries = cooldowns.size;
      const text = `${actor.name} invoked a Court mandate: a binding 12h armistice with ${target.name}.`;
      return deps.ok([playerId, targetPlayerId], { [playerId]: text, [targetPlayerId]: text });
    }
  };
}

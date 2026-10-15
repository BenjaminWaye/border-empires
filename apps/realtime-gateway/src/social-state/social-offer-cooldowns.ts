// Per-pair "you can't re-offer yet" cooldowns for truce and alliance offers.
// Without these a player can re-send an offer the instant the previous one
// was rejected, cancelled, or expired, spamming the target with offers. The
// cooldown is directional (sender -> target) and per offer kind, so a
// refused truce doesn't block an alliance offer and the target can still
// make their own offer back.

export type SocialOfferKind = "truce" | "alliance";

export type SocialOfferCooldown = {
  kind: SocialOfferKind;
  fromPlayerId: string;
  toPlayerId: string;
  until: number;
};

/** After the target rejects, or the sender cancels (cancel+resend must not dodge it). */
export const OFFER_REJECTED_COOLDOWN_MS = 30 * 60_000;
/** After a truce offer simply runs out unanswered (alliance offers never expire). */
export const OFFER_EXPIRED_COOLDOWN_MS = 10 * 60_000;
// Hard bound on the map (docs/agents/state-and-persistence-discipline.md).
// Entries self-expire within 30 minutes, so this is only reachable under
// abuse; when hit, the soonest-to-expire entry is evicted.
export const MAX_OFFER_COOLDOWNS = 20_000;

const cooldownKey = (kind: SocialOfferKind, fromPlayerId: string, toPlayerId: string): string => `${kind}:${fromPlayerId}:${toPlayerId}`;

export type SocialOfferCooldowns = {
  start: (kind: SocialOfferKind, fromPlayerId: string, toPlayerId: string, durationMs: number) => SocialOfferCooldown;
  /** Remaining ms, or 0 when the sender may offer again. */
  remainingMs: (kind: SocialOfferKind, fromPlayerId: string, toPlayerId: string) => number;
  outgoingFor: (playerId: string) => SocialOfferCooldown[];
  /** Drops expired entries; returns whether anything was removed. */
  sweep: () => boolean;
  size: () => number;
};

export const createSocialOfferCooldowns = (now: () => number, initial: readonly SocialOfferCooldown[] = []): SocialOfferCooldowns => {
  const byKey = new Map<string, SocialOfferCooldown>();
  const evictSoonest = (): void => {
    let soonestKey: string | undefined;
    let soonestUntil = Number.POSITIVE_INFINITY;
    for (const [key, entry] of byKey) {
      if (entry.until < soonestUntil) {
        soonestUntil = entry.until;
        soonestKey = key;
      }
    }
    if (soonestKey !== undefined) byKey.delete(soonestKey);
  };
  const put = (entry: SocialOfferCooldown): void => {
    const key = cooldownKey(entry.kind, entry.fromPlayerId, entry.toPlayerId);
    if (!byKey.has(key) && byKey.size >= MAX_OFFER_COOLDOWNS) evictSoonest();
    byKey.set(key, entry);
  };
  const current = now();
  for (const entry of initial) {
    if (entry.until > current) put({ ...entry });
  }
  return {
    start(kind, fromPlayerId, toPlayerId, durationMs) {
      const entry: SocialOfferCooldown = { kind, fromPlayerId, toPlayerId, until: now() + durationMs };
      put(entry);
      return entry;
    },
    remainingMs(kind, fromPlayerId, toPlayerId) {
      const entry = byKey.get(cooldownKey(kind, fromPlayerId, toPlayerId));
      return entry ? Math.max(0, entry.until - now()) : 0;
    },
    outgoingFor(playerId) {
      const at = now();
      const out: SocialOfferCooldown[] = [];
      for (const entry of byKey.values()) {
        if (entry.fromPlayerId === playerId && entry.until > at) out.push({ ...entry });
      }
      return out;
    },
    sweep() {
      const at = now();
      let removed = false;
      for (const [key, entry] of byKey) {
        if (entry.until <= at) {
          byKey.delete(key);
          removed = true;
        }
      }
      return removed;
    },
    size: () => byKey.size
  };
};

/** "24m" / "1m" — rounded up so a player is never told 0m while still blocked. */
export const formatCooldownRemaining = (remainingMs: number): string => `${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;

import type { DockPair } from "../client-types.js";
import type { DockLanding } from "./client-dock-landing.js";

const GAP_GRACE_MS = 2000;
const MAX_LANDINGS = 64;
type RememberedLanding = { originKey: string; landing: DockLanding; expiresAt: number };

/** Client-only continuity across independent result/delta messages. Never persisted. */
export class DockLandingMemory {
  private readonly entries = new Map<string, RememberedLanding>();
  private routes: readonly DockPair[] | undefined;
  // Debug gauges/counters expose both bounds, including guard evictions.
  readonly metrics = { entries: 0, expired: 0, evicted: 0 };

  syncRoutes(routes: readonly DockPair[] | undefined): void {
    if (this.routes === routes) return;
    this.entries.clear(); this.metrics.entries = 0; this.routes = routes;
  }

  prune(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (nowMs < entry.expiresAt) continue;
      this.entries.delete(key); this.metrics.expired++;
    }
    this.metrics.entries = this.entries.size;
  }

  get(key: string, originKey: string, nowMs: number): DockLanding | undefined {
    this.prune(nowMs);
    const entry = this.entries.get(key);
    return entry?.originKey === originKey ? entry.landing : undefined;
  }

  remember(key: string, originKey: string, candidate: DockLanding, nowMs: number, resolved: boolean): DockLanding {
    const previous = this.get(key, originKey, nowMs);
    // A new attack starts a new landing. Only a result may inherit across a
    // missing skirmishSeenAt, as that map can be pruned between WS messages.
    const landing = previous && (resolved || previous.startAt === candidate.startAt) ? previous : candidate;
    this.entries.delete(key);
    this.entries.set(key, { originKey, landing, expiresAt: nowMs + GAP_GRACE_MS });
    if (this.entries.size > MAX_LANDINGS) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) { this.entries.delete(oldest); this.metrics.evicted++; }
    }
    this.metrics.entries = this.entries.size;
    return landing;
  }
}

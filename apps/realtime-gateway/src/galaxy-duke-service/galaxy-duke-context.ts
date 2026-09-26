// Shared plumbing for the Duke service: dependencies, per-Duke locking, the
// world snapshot (who holds what) and the effects applier. Kept apart from the
// tick and the actions so both use one implementation of each.
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { DEFAULT_TOTAL_SECTORS } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import type { DukeEffect } from "../galaxy-duke-engine/galaxy-duke-production.js";
import type { HeldSector } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeCounter, DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import type { GalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";

export type GalaxyDukeDeps = {
  dukeStore: GalaxyDukeStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  galaxyBattleLogStore: GalaxyBattleLogStore;
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  galaxyExplorationStore?: GalaxyExplorationStore;
  galaxyPlanetStore?: GalaxyPlanetStore;
  authBindingStore: GatewayAuthBindingStore;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  totalSectors?: number;
  now?: () => number;
  // Every guard/cap that fires reports here (state-and-persistence-discipline).
  onCounter?: (name: DukeCounter) => void;
  onError?: (error: unknown) => void;
};

export type DukeWorld = {
  holdingsByOwner: Map<string, HeldSector[]>;
  ownerOfSeason: Map<string, string>;
  tierOfSeason: Map<string, "PLANET" | "OUTPOST">;
  // Everyone holding at least one Planet: the Dukes (§3).
  dukeUids: string[];
  capturedSectors: number;
};

export type DukeContext = {
  deps: GalaxyDukeDeps;
  now: () => number;
  totalSectors: number;
  // Runs `fn` alone: every Duke mutation shares one lock. A raid touches both the
  // attacker and the defender, so per-Duke locks could deadlock two Dukes raiding
  // each other; at this scale a single lock costs nothing.
  withLock: <T>(fn: () => Promise<T>) => Promise<T>;
  loadWorld: () => Promise<DukeWorld>;
  countAll: (counters: ReadonlyArray<DukeCounter>) => void;
  labelFor: (seasonId: string) => Promise<string>;
  // Applies engine effects to the economy store. Returns the Sectors that just
  // reached 0 Stability and were opened to a Defense Campaign (§7).
  applyEffects: (authUid: string, effects: ReadonlyArray<DukeEffect>, world: DukeWorld) => Promise<string[]>;
  noteContested: (state: DukeState, seasonIds: ReadonlyArray<string>, at: number) => Promise<DukeState>;
};

const WORLD_CACHE_MS = 30_000;

export const createDukeContext = (deps: GalaxyDukeDeps): DukeContext => {
  const now = deps.now ?? (() => Date.now());
  let tail: Promise<unknown> = Promise.resolve();
  const withLock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };

  // Who holds what changes only when a season ends, but reading it means loading
  // every season archive (each carries its replay events), and every open client
  // polls. One short-lived cached snapshot keeps that off the hot path.
  let cachedWorld: { at: number; world: DukeWorld } | undefined;
  const loadWorld = async (): Promise<DukeWorld> => {
    if (cachedWorld && now() - cachedWorld.at >= 0 && now() - cachedWorld.at < WORLD_CACHE_MS) return cachedWorld.world;
    const world = await readWorld();
    cachedWorld = { at: now(), world };
    return world;
  };

  const readWorld = async (): Promise<DukeWorld> => {
    const raw = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: deps.listSeasonArchives,
      ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
      authBindingStore: deps.authBindingStore,
      ...(deps.galaxyDefenseCampaignStore ? { galaxyDefenseCampaignStore: deps.galaxyDefenseCampaignStore } : {})
    });
    const holdingsByOwner = new Map<string, HeldSector[]>();
    const ownerOfSeason = new Map<string, string>();
    const tierOfSeason = new Map<string, "PLANET" | "OUTPOST">();
    const dukeUids: string[] = [];
    let capturedSectors = 0;
    for (const [authUid, territories] of raw) {
      const held = territories.map((t): HeldSector => ({ seasonId: t.seasonId, tier: t.tier, specialization: t.specialization }));
      holdingsByOwner.set(authUid, held);
      for (const h of held) {
        ownerOfSeason.set(h.seasonId, authUid);
        tierOfSeason.set(h.seasonId, h.tier);
        if (h.tier === "PLANET") capturedSectors += 1;
      }
      if (held.some((h) => h.tier === "PLANET")) dukeUids.push(authUid);
    }
    dukeUids.sort();
    return { holdingsByOwner, ownerOfSeason, tierOfSeason, dukeUids, capturedSectors };
  };

  const countAll = (counters: ReadonlyArray<DukeCounter>): void => {
    for (const c of counters) deps.onCounter?.(c);
  };

  const labelFor = async (seasonId: string): Promise<string> =>
    (await deps.galaxyPlanetStore?.getBySeasonId(seasonId))?.planetName ?? "an unnamed world";

  const applyEffects = async (authUid: string, effects: ReadonlyArray<DukeEffect>, world: DukeWorld): Promise<string[]> => {
    const contested: string[] = [];
    for (const effect of effects) {
      if (effect.kind === "INFLUENCE_DELTA") {
        const balance = await deps.galaxyEconomyStore.getBalance(authUid);
        await deps.galaxyEconomyStore.upsertBalance({
          authUid,
          influence: (balance?.influence ?? 0) + effect.delta,
          production: balance?.production ?? 0,
          lastCycleAt: balance?.lastCycleAt ?? now()
        });
        continue;
      }
      const tier = world.tierOfSeason.get(effect.seasonId);
      if (!tier) continue;
      const record = await deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: effect.seasonId, tier });
      const next = Math.max(0, Math.min(100, record.stability + effect.delta));
      await deps.galaxyEconomyStore.setStability(authUid, effect.seasonId, next);
      if (next === 0 && effect.delta < 0 && record.stability > 0) {
        await deps.galaxyDefenseCampaignStore?.enqueueContested({ targetSeasonId: effect.seasonId, targetAuthUid: authUid, queuedAt: now() });
        contested.push(effect.seasonId);
      }
    }
    return contested;
  };

  const noteContested = async (state: DukeState, seasonIds: ReadonlyArray<string>, at: number): Promise<DukeState> => {
    let next = state;
    for (const seasonId of seasonIds) {
      const pushed = pushDigest(
        next,
        at,
        "COMBAT",
        `${await labelFor(seasonId)} fell to 0 Stability and is now contested: a Defense Campaign season is open to anyone.`
      );
      next = pushed.state;
      countAll(pushed.counters);
    }
    return next;
  };

  return { deps, now, totalSectors: deps.totalSectors ?? DEFAULT_TOTAL_SECTORS, withLock, loadWorld, countAll, labelFor, applyEffects, noteContested };
};

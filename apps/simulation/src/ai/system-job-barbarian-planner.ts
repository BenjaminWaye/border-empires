import {
  BARBARIAN_ATTACKS_PER_MINUTE,
  BARBARIAN_INFLIGHT_TIMEOUT_MS,
  BARBARIAN_TILE_REST_MS,
  PLANETARY_DEFENSE_RAIDS_PER_HOUSE_PER_WINDOW,
  lastManpowerRefillAtMs
} from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { candidateKeysForOrigin, createFrontierCommand, type PlannerTile, type PlannerTileLookup } from "./frontier-scoring.js";

/**
 * Planetary Defense planner (docs/planetary-defense-camps-plan.md). Each camp
 * (its camp tile plus the frontier carrying its campId) takes at most one
 * action at a time and rests BARBARIAN_TILE_REST_MS after it settles. Only
 * awake camps act: a watcher can see one of their tiles (the main thread's
 * camp-awake-tracker.ts sends the set). A camp acts only from its own tiles:
 *   1. attack a House tile next to its land, if the faction-wide attack budget
 *      and the camp's raid limit on that House allow it, towns and docks first;
 *   2. otherwise expand into adjacent neutral land, towns and docks first;
 *   3. with no target, sleep until a tile next to its land changes owner
 *      (`wakeCamp`), with a slow retry as a safety net.
 * Deliberately not the House AI's frontier scorer: none of its economy,
 * food or scouting weights matter here.
 */
export const BARBARIAN_PLAYER_ID = "barbarian-1";

// Safety net for a camp that found no target and was never woken.
const NO_TARGET_RETRY_MS = 30_000;
// A target the runtime refused (sealed by an Aether Wall, locked by another
// fight, ...) is skipped by that camp for this long instead of retried every rest.
const REJECTED_TARGET_AVOID_MS = 60_000;
const ATTACK_BUDGET_WINDOW_MS = 60_000;

export type BarbarianPlannerDeps = {
  readonly tilesByKey: PlannerTileLookup;
  /** Live camps (camp tile keys). */
  readonly campIds: () => Iterable<string>;
  /** The tiles of one camp, camp tile included. */
  readonly campTiles: (campId: string) => readonly PlannerTile[];
  readonly getDockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  /** Camps a watcher can see right now. */
  readonly getAwakeCampIds: () => ReadonlySet<string>;
  readonly now?: () => number;
  readonly restMs?: number;
  readonly attacksPerMinute?: number;
  readonly raidsPerHousePerWindow?: number;
  readonly inFlightTimeoutMs?: number;
};

/**
 * What survives a restart: when each camp may act again and its raids per
 * House in that House's current manpower window. Saved in snapshots
 * (runtime-snapshot-sidecars.ts); bounded by camps x Houses raided. In-flight
 * commands are not saved: a recovered lock resolves without settling one.
 */
export type PlanetaryDefensePlannerSnapshot = {
  camps: Array<{ campId: string; restUntil?: number; raids?: Array<{ houseId: string; windowStart: number; count: number }> }>;
};

export type BarbarianPlanner = {
  /** At most one command per call; the camp that has waited longest goes first. */
  readonly choose: (clientSeq: number, issuedAt: number) => CommandEnvelope | null;
  /**
   * A command the planner issued finished (resolved, rejected or cancelled); its camp rests from
   * `settledAt`. `rejected`: the runtime refused it, so its attack-budget slot and raid are
   * refunded and the camp avoids that target for a while.
   */
  readonly settle: (commandId: string, settledAt: number, rejected?: boolean) => void;
  /** Something next to this camp changed owner: a sleeping camp looks again. */
  readonly wakeCamp: (campId: string) => void;
  readonly inFlightCount: () => number;
  /** camp id -> time before which the camp may not act again. */
  readonly restUntilByCamp: ReadonlyMap<string, number>;
  readonly exportState: () => PlanetaryDefensePlannerSnapshot;
  readonly restoreState: (snapshot: PlanetaryDefensePlannerSnapshot | undefined) => void;
};

type InFlight = {
  readonly campId: string;
  readonly targetKey: string;
  readonly issuedAt: number;
  readonly attack: boolean;
  /** House whose garrisoned tile this raid targets (counted against the raid limit). */
  readonly raidedHouseId?: string;
};
type CampAction = { from: PlannerTile; target: PlannerTile; type: "ATTACK" | "EXPAND"; score: number; targetKey: string };

const dropDeadCamps = <V>(byCamp: Map<string, V>, live: ReadonlySet<string>): void => {
  for (const campId of byCamp.keys()) if (!live.has(campId)) byCamp.delete(campId);
};
const isBarbarian = (ownerId: string | undefined): boolean => ownerId?.startsWith("barbarian-") === true;
const targetValue = (tile: PlannerTile): number => (tile.town || tile.dockId ? 100 : 0) + (tile.resource ? 10 : 0);

export const createBarbarianPlanner = (deps: BarbarianPlannerDeps): BarbarianPlanner => {
  const now = deps.now ?? (() => Date.now());
  const restMs = deps.restMs ?? BARBARIAN_TILE_REST_MS;
  const attacksPerMinute = deps.attacksPerMinute ?? BARBARIAN_ATTACKS_PER_MINUTE;
  const raidsPerWindow = deps.raidsPerHousePerWindow ?? PLANETARY_DEFENSE_RAIDS_PER_HOUSE_PER_WINDOW;
  const inFlightTimeoutMs = deps.inFlightTimeoutMs ?? BARBARIAN_INFLIGHT_TIMEOUT_MS;

  // Every map is keyed by camp (≤ MAX_PLANETARY_DEFENSE_CAMPS) or command in
  // flight (≤ one per camp); `prune` drops entries for camps that are gone.
  const restUntilByCamp = new Map<string, number>();
  const lastActedByCamp = new Map<string, number>();
  const sleepingUntilByCamp = new Map<string, number>();
  const inFlightByCommandId = new Map<string, InFlight>();
  // campId -> House id -> raids on that House's garrisoned land in its current manpower window.
  const raidsByCamp: RaidsByCamp = new Map();
  const attackIssuedAt: number[] = [];
  // campId -> target key -> until when that camp skips it (after a rejection); small per camp.
  const avoidUntilByCamp = new Map<string, Map<string, number>>();

  const refundRejected = (entry: InFlight, settledAt: number): void => {
    if (entry.attack) {
      const slot = attackIssuedAt.indexOf(entry.issuedAt);
      if (slot >= 0) attackIssuedAt.splice(slot, 1);
    }
    const raids = entry.raidedHouseId ? raidsByCamp.get(entry.campId)?.get(entry.raidedHouseId) : undefined;
    if (raids && raids.count > 0) raids.count -= 1;
    let avoid = avoidUntilByCamp.get(entry.campId);
    if (!avoid) {
      avoid = new Map();
      avoidUntilByCamp.set(entry.campId, avoid);
    }
    for (const [key, until] of avoid) if (until <= settledAt) avoid.delete(key);
    avoid.set(entry.targetKey, settledAt + REJECTED_TARGET_AVOID_MS);
  };

  const settle = (commandId: string, settledAt: number, rejected = false): void => {
    const entry = inFlightByCommandId.get(commandId);
    if (!entry) return;
    inFlightByCommandId.delete(commandId);
    if (rejected) refundRejected(entry, settledAt);
    restUntilByCamp.set(entry.campId, settledAt + restMs);
  };

  const attackBudgetOpen = (t: number): boolean => {
    while (attackIssuedAt.length > 0 && t - attackIssuedAt[0]! >= ATTACK_BUDGET_WINDOW_MS) attackIssuedAt.shift();
    return attackIssuedAt.length < attacksPerMinute;
  };

  const raidAllowed = (campId: string, houseId: string, t: number): boolean => {
    const entry = raidsByCamp.get(campId)?.get(houseId);
    return !entry || entry.windowStart !== lastManpowerRefillAtMs(houseId, t) || entry.count < raidsPerWindow;
  };

  const recordRaid = (campId: string, houseId: string, t: number): void => {
    const windowStart = lastManpowerRefillAtMs(houseId, t);
    let byHouse = raidsByCamp.get(campId);
    if (!byHouse) {
      byHouse = new Map();
      raidsByCamp.set(campId, byHouse);
    }
    const entry = byHouse.get(houseId);
    byHouse.set(houseId, entry && entry.windowStart === windowStart ? { windowStart, count: entry.count + 1 } : { windowStart, count: 1 });
  };

  const prune = (live: ReadonlySet<string>, t: number): void => {
    for (const [commandId, entry] of inFlightByCommandId) {
      if (t - entry.issuedAt >= inFlightTimeoutMs) settle(commandId, t);
    }
    dropDeadCamps(restUntilByCamp, live);
    dropDeadCamps(lastActedByCamp, live);
    dropDeadCamps(sleepingUntilByCamp, live);
    dropDeadCamps(raidsByCamp, live);
    dropDeadCamps(avoidUntilByCamp, live);
  };

  /**
   * The camp's best action, or why it has none: `held` means a target exists but
   * is held back for now (attack budget spent, raid limit reached, a recent
   * rejection), so the camp should look again soon rather than sleep.
   */
  const pickFor = (campId: string, busyTargets: ReadonlySet<string>, canAttack: boolean, t: number): { best?: CampAction; held: boolean } => {
    const dockLinks = deps.getDockLinksByDockTileKey();
    const avoid = avoidUntilByCamp.get(campId);
    let best: CampAction | undefined;
    let held = false;
    for (const from of deps.campTiles(campId)) {
      for (const targetKey of candidateKeysForOrigin(from, dockLinks, deps.tilesByKey)) {
        if (busyTargets.has(targetKey)) continue;
        const target = deps.tilesByKey.get(targetKey);
        if (!target || target.terrain !== "LAND" || isBarbarian(target.ownerId)) continue;
        if ((avoid?.get(targetKey) ?? 0) > t) {
          held = true;
          continue;
        }
        let type: CampAction["type"];
        if (target.ownerId) {
          if (!canAttack || (target.ownershipState === "SETTLED" && !raidAllowed(campId, target.ownerId, t))) {
            held = true;
            continue;
          }
          type = "ATTACK";
        } else {
          type = "EXPAND";
        }
        // Attacks outrank expansions; then towns/docks, then resources; then a stable tile order.
        const score = (type === "ATTACK" ? 1_000 : 0) + targetValue(target);
        if (!best || score > best.score || (score === best.score && targetKey < best.targetKey)) {
          best = { from, target, type, score, targetKey };
        }
      }
    }
    return best ? { best, held } : { held };
  };

  const choose = (clientSeq: number, issuedAt: number): CommandEnvelope | null => {
    const t = now();
    const live = new Set(deps.campIds());
    prune(live, t);
    const awake = deps.getAwakeCampIds();
    const busyCamps = new Set<string>();
    const busyTargets = new Set<string>();
    for (const entry of inFlightByCommandId.values()) {
      busyCamps.add(entry.campId);
      busyTargets.add(entry.targetKey);
    }
    const eligible: Array<{ campId: string; lastActed: number }> = [];
    for (const campId of awake) {
      if (!live.has(campId) || busyCamps.has(campId)) continue;
      if ((restUntilByCamp.get(campId) ?? 0) > t || (sleepingUntilByCamp.get(campId) ?? 0) > t) continue;
      eligible.push({ campId, lastActed: lastActedByCamp.get(campId) ?? 0 });
    }
    eligible.sort((a, b) => a.lastActed - b.lastActed || (a.campId < b.campId ? -1 : 1));
    const canAttack = attackBudgetOpen(t);
    for (const { campId } of eligible) {
      const { best: pick, held } = pickFor(campId, busyTargets, canAttack, t);
      if (!pick) {
        // Nothing to take at all: sleep until a neighbour changes. Only held back: look again next time.
        if (!held) sleepingUntilByCamp.set(campId, t + NO_TARGET_RETRY_MS);
        continue;
      }
      const command = createFrontierCommand({ from: pick.from, target: pick.target, score: pick.score }, BARBARIAN_PLAYER_ID, clientSeq, issuedAt, "system-runtime", pick.type);
      const raidedHouseId = pick.type === "ATTACK" && pick.target.ownershipState === "SETTLED" ? pick.target.ownerId : undefined;
      if (pick.type === "ATTACK") attackIssuedAt.push(t);
      if (raidedHouseId) recordRaid(campId, raidedHouseId, t);
      inFlightByCommandId.set(command.commandId, { campId, targetKey: pick.targetKey, issuedAt: t, attack: pick.type === "ATTACK", ...(raidedHouseId ? { raidedHouseId } : {}) });
      lastActedByCamp.set(campId, t);
      return command;
    }
    return null;
  };

  return {
    choose,
    settle,
    wakeCamp: (campId) => {
      sleepingUntilByCamp.delete(campId);
    },
    inFlightCount: () => inFlightByCommandId.size,
    restUntilByCamp,
    exportState: () => exportPlannerState(restUntilByCamp, raidsByCamp, now()),
    restoreState: (snapshot) => restorePlannerState(snapshot, restUntilByCamp, raidsByCamp)
  };
};

type RaidsByCamp = Map<string, Map<string, { windowStart: number; count: number }>>;

/** Live entries only: a rest that has ended or a raid window with no raids carries nothing. */
const exportPlannerState = (restUntilByCamp: ReadonlyMap<string, number>, raidsByCamp: RaidsByCamp, t: number): PlanetaryDefensePlannerSnapshot => {
  const campIds = new Set([...restUntilByCamp.keys(), ...raidsByCamp.keys()]);
  const camps: PlanetaryDefensePlannerSnapshot["camps"] = [];
  for (const campId of [...campIds].sort()) {
    const restUntil = restUntilByCamp.get(campId);
    const raids = [...(raidsByCamp.get(campId) ?? [])]
      .filter(([houseId, entry]) => entry.count > 0 && entry.windowStart === lastManpowerRefillAtMs(houseId, t))
      .map(([houseId, entry]) => ({ houseId, windowStart: entry.windowStart, count: entry.count }));
    const live = restUntil !== undefined && restUntil > t;
    if (!live && raids.length === 0) continue;
    camps.push({ campId, ...(live ? { restUntil } : {}), ...(raids.length > 0 ? { raids } : {}) });
  }
  return { camps };
};

/** Ignores malformed entries rather than failing a boot. */
const restorePlannerState = (snapshot: PlanetaryDefensePlannerSnapshot | undefined, restUntilByCamp: Map<string, number>, raidsByCamp: RaidsByCamp): void => {
  for (const camp of snapshot?.camps ?? []) {
    if (typeof camp?.campId !== "string") continue;
    if (typeof camp.restUntil === "number" && Number.isFinite(camp.restUntil)) restUntilByCamp.set(camp.campId, camp.restUntil);
    const byHouse = new Map<string, { windowStart: number; count: number }>();
    for (const raid of camp.raids ?? []) {
      if (typeof raid?.houseId === "string" && Number.isFinite(raid.windowStart) && Number.isInteger(raid.count) && raid.count > 0) {
        byHouse.set(raid.houseId, { windowStart: raid.windowStart, count: raid.count });
      }
    }
    if (byHouse.size > 0) raidsByCamp.set(camp.campId, byHouse);
  }
};

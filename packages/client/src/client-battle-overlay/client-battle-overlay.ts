import { APPROACH_MS, CLASH_MS, ROUT_MS } from "../client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import type { ClientState } from "../client-state/client-state.js";
import type { SquadGear, SquadGearFields } from "../client-map-3d-popup-marine/popup-marine-gear.js";

// Wire shape of a TILE_DELTA_BATCH tile delta's `combatJson` field (mirrors
// CombatBroadcastPayload in @border-empires/sim-protocol — duplicated here
// rather than imported since the client package doesn't depend on
// sim-protocol; it only ever sees this over the wire as untyped JSON).
type WireWarGear = { titaniumArmor?: boolean; umbriteArms?: boolean };

type CombatBroadcastPayload = {
  attackerOwnerId: string;
  defenderOwnerId: string;
  attackerWon: boolean;
  originX: number;
  originY: number;
  at: number;
  // Reactive shield reveal (docs/replenishment-update-plan.md workstream E):
  // the defender's flag that matched this attack's commitment, if any --
  // coordinates only, never the matched amount (a losing attacker learns a
  // shield fired by seeing it, the same way every other hidden enemy
  // strength number stays hidden until a fight reveals it).
  shield?: { x: number; y: number };
  // Each side's cosmetic war industry (CombatBroadcastPayload's
  // BattleWarGear): one flag per weapons factory type the empire owns.
  attackerGear?: WireWarGear;
  defenderGear?: WireWarGear;
};

const isCombatBroadcastPayload = (value: unknown): value is CombatBroadcastPayload =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as CombatBroadcastPayload).attackerOwnerId === "string" &&
  typeof (value as CombatBroadcastPayload).defenderOwnerId === "string" &&
  typeof (value as CombatBroadcastPayload).attackerWon === "boolean" &&
  typeof (value as CombatBroadcastPayload).originX === "number" &&
  typeof (value as CombatBroadcastPayload).originY === "number";

export type ActiveBattleOverlay = {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  attackerOwnerId: string;
  defenderOwnerId: string;
  attackerWon: boolean;
  startAt: number;
  clashAt: number;
  endAt: number;
  fromSkirmish: boolean;
  // Reactive shield reveal: the defender's shield-tile coordinates, when a
  // shield matched this attack's commitment. Both renderers add a second
  // march-in group from this tile toward the target, alongside the
  // attacker's own march-in from originX/originY.
  shieldX?: number;
  shieldY?: number;
  attackerGear?: SquadGear;
  defenderGear?: SquadGear;
};

// Comfortably above any real season's empire count; only a guard against a
// very long session accumulating ids (AGENTS.md state discipline).
const MAX_REMEMBERED_GEAR_OWNERS = 512;

const squadGearFromWire = (gear: WireWarGear | undefined): SquadGear => ({
  ...(gear?.titaniumArmor === true ? { titanium: true } : {}),
  ...(gear?.umbriteArms === true ? { umbrite: true } : {})
});

const hasAnyGear = (gear: SquadGear): boolean => gear.titanium === true || gear.umbrite === true;

/** Records what a broadcast says an owner's war industry is, so a later
 * pre-resolution skirmish involving them can show it before its own
 * broadcast lands. A broadcast without any gear clears the owner, so an
 * empire that lost its last factory goes back to plain infantry. */
const rememberSquadGear = (owners: Map<string, SquadGear>, ownerId: string, gear: SquadGear): void => {
  owners.delete(ownerId);
  if (!hasAnyGear(gear)) return;
  owners.set(ownerId, gear);
  if (owners.size > MAX_REMEMBERED_GEAR_OWNERS) {
    const oldest = owners.keys().next().value;
    if (oldest !== undefined) owners.delete(oldest);
  }
};

/** Squad gear to render for `ownerId` when no broadcast has said otherwise
 * for this specific fight (skirmishes, capture-hold garrisons). */
export const knownSquadGearFor = (state: Pick<ClientState, "squadGearByOwner">, ownerId: string | undefined): SquadGear =>
  (ownerId ? state.squadGearByOwner.get(ownerId) : undefined) ?? {};

/** Both sides' gear for a battle/skirmish render entry: a resolved battle's
 * own broadcast wins, otherwise whatever is known per owner. */
export const squadGearFields = (
  state: Pick<ClientState, "squadGearByOwner">,
  attackerOwnerId: string,
  defenderOwnerId: string,
  resolved?: Pick<ActiveBattleOverlay, "attackerGear" | "defenderGear">
): SquadGearFields => ({
  attackerGear: resolved?.attackerGear ?? knownSquadGearFor(state, attackerOwnerId),
  defenderGear: resolved?.defenderGear ?? knownSquadGearFor(state, defenderOwnerId)
});

/** Parses a tile delta's raw `combatJson` field (if present) and, when valid,
 * registers/refreshes an entry in state.activeBattles keyed by the target
 * tile — the single entry point every viewer (attacker, defender, and any
 * bystander with fog-of-war vision on the tile) uses to pick up the battle
 * overlay FX. Purely additive: never touches state.capture or the frontier
 * action-queue HUD. */
export const registerActiveBattleFromTileDelta = (
  state: Pick<ClientState, "activeBattles" | "skirmishSeenAt" | "squadGearByOwner">,
  keyFor: (x: number, y: number) => string,
  update: { x: number; y: number; combatJson?: string },
  nowMs: number
): void => {
  if (!update.combatJson) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(update.combatJson);
  } catch {
    return;
  }
  if (!isCombatBroadcastPayload(parsed)) return;
  const key = keyFor(update.x, update.y);
  // The resolved battle always starts already standing at the firing line —
  // it never replays the run-in-from-the-tile-edge approach. By the time a
  // resolution broadcast lands, the pre-resolution skirmish (see
  // client-map-3d-capture-overlays.ts) has, in every real case, already run
  // that approach; repeating it here read as the fight restarting from
  // scratch. Pinning startAt this far in the past makes computeBattlePose
  // (popup-marine-timeline.ts) skip straight past its LINEUP_MS/MARCH_MS
  // phases into the firefight, landing each marine at exactly the
  // firingX/firingZ slot it was already standing at — that position is a
  // pure function of the tile's hashSeed, not of elapsed time, so it's
  // identical to wherever the skirmish left this same marine.
  //
  // This used to instead try to inherit the skirmish's own startAt/timing
  // (via state.skirmishSeenAt) so the approach-phase interpolation picked
  // up "mid-stride". That chased two problems that no longer matter here:
  // an attacker's own client learns of resolution via two independent WS
  // messages with no ordering guarantee (COMBAT_RESULT can clear
  // state.capture before the TILE_DELTA_BATCH carrying combatJson arrives,
  // dropping the inherited timestamp), and a defender's skirmish can hold
  // its approach open past the default APPROACH_MS. Skipping the approach
  // outright sidesteps both — there's no timing to inherit or race over.
  const seenAt = state.skirmishSeenAt.get(key);
  const attackerGear = squadGearFromWire(parsed.attackerGear);
  const defenderGear = squadGearFromWire(parsed.defenderGear);
  rememberSquadGear(state.squadGearByOwner, parsed.attackerOwnerId, attackerGear);
  rememberSquadGear(state.squadGearByOwner, parsed.defenderOwnerId, defenderGear);
  const startAt = nowMs - APPROACH_MS;
  const clashAt = nowMs;
  state.activeBattles.set(key, {
    originX: parsed.originX,
    originY: parsed.originY,
    targetX: update.x,
    targetY: update.y,
    attackerOwnerId: parsed.attackerOwnerId,
    defenderOwnerId: parsed.defenderOwnerId,
    attackerWon: parsed.attackerWon,
    startAt,
    clashAt,
    endAt: clashAt + CLASH_MS + ROUT_MS,
    // Purely informational now (see computeBattlePose's preDead handling) —
    // no longer load-bearing for positioning, so a missed seenAt (e.g. the
    // COMBAT_RESULT/TILE_DELTA_BATCH race above) only means a marine that
    // already fell during the skirmish's own firefight loop briefly
    // re-plays its death animation instead of starting collapsed, not a
    // full restart.
    fromSkirmish: seenAt !== undefined,
    ...(parsed.shield ? { shieldX: parsed.shield.x, shieldY: parsed.shield.y } : {}),
    attackerGear,
    defenderGear
  });
};

export const pruneExpiredActiveBattles = (state: Pick<ClientState, "activeBattles">, nowMs: number): void => {
  for (const [key, battle] of state.activeBattles) {
    if (nowMs >= battle.endAt) state.activeBattles.delete(key);
  }
};

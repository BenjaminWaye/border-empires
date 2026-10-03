import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type IncomingAttack = NonNullable<ReturnType<ClientState["incomingAttacksByTile"]["get"]>>;

// When an incoming attack's combat lock actually started ticking on the
// target. The server stamps resolvesAt = accept time + combat lock (+ any
// muster travel), and only sends transitEndsAt when there was travel -- so
// the combat window begins at transitEndsAt when present, else one combat
// lock before resolution. (A Steam Vanguard attacker's shortened lock makes
// this start a little early; the sweep then simply begins part-filled.)
export const incomingAttackCombatStartAt = (incoming: IncomingAttack): number =>
  incoming.transitEndsAt ?? incoming.resolvesAt - COMBAT_LOCK_MS;

export type IncomingFrontierClaim = {
  key: string;
  targetX: number;
  targetY: number;
  attackerId: string | undefined;
  fromX: number | undefined;
  fromY: number | undefined;
  startAt: number;
  resolvesAt: number;
};

// Enemy ATTACKs currently resolving against this player's own FRONTIER
// tiles, past any muster travel leg. FRONTIER ground has no defending force
// (runtime-lock-resolution.ts's hasDefendingForce): the server resolves it as
// a guaranteed capture with no roll and no combat broadcast, so the skirmish
// FX deliberately skips these tiles (client-map-3d-capture-overlays.ts).
// Without this, the defender saw only the red under-attack cross -- no
// soldiers, and none of the "goes neutral, attacker colour sweeps in"
// presentation an attacker gets for the very same capture. Shared by the 3D
// claim plates / ownership tint / claim march and the 2D incoming-attack
// overlay so both renderers agree on which tiles are being taken.
export const activeIncomingFrontierClaims = (
  state: Pick<ClientState, "incomingAttacksByTile" | "tiles" | "me">,
  nowEpochMs: number
): IncomingFrontierClaim[] => {
  const claims: IncomingFrontierClaim[] = [];
  for (const key of state.incomingAttacksByTile.keys()) {
    const claim = incomingFrontierClaimAt(state, key, nowEpochMs);
    if (claim) claims.push(claim);
  }
  return claims;
};

// Single-tile form of activeIncomingFrontierClaims, for per-tile draw loops.
export const incomingFrontierClaimAt = (
  state: Pick<ClientState, "incomingAttacksByTile" | "tiles" | "me">,
  key: string,
  nowEpochMs: number
): IncomingFrontierClaim | undefined => {
  const incoming = state.incomingAttacksByTile.get(key);
  if (!incoming || !state.me || incoming.resolvesAt <= nowEpochMs) return undefined;
  if (incoming.transitEndsAt !== undefined && incoming.transitEndsAt > nowEpochMs) return undefined;
  const tile = state.tiles.get(key);
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") return undefined;
  return {
    key,
    targetX: tile.x,
    targetY: tile.y,
    attackerId: incoming.attackerId,
    fromX: incoming.fromX,
    fromY: incoming.fromY,
    startAt: incomingAttackCombatStartAt(incoming),
    resolvesAt: incoming.resolvesAt
  };
};

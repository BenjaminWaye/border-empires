import type { SimulationClientEvent } from "../sim-client/sim-client.js";

type CombatResolvedEvent = Extract<SimulationClientEvent, { eventType: "COMBAT_RESOLVED" }>;

// §20: the attacker's own combat outcome (manpower spent, gold/resources
// plundered) was computed by the simulation but never forwarded past
// gateway-app.ts's processSimulationEvent — client-network.ts's COMBAT_RESULT
// listener and combatResolutionAlert() have been dead code on the wire since
// the rewrite-stack gateway shipped. This restores it, addressed only to the
// attacker (matches event.playerId).
export const combatResultPayloadForAttacker = (event: CombatResolvedEvent): Record<string, unknown> => ({
  type: "COMBAT_RESULT",
  commandId: event.commandId,
  attackType: event.actionType,
  origin: { x: event.originX, y: event.originY },
  target: { x: event.targetX, y: event.targetY },
  attackerWon: event.attackerWon,
  ...(typeof event.manpowerDelta === "number" ? { manpowerDelta: event.manpowerDelta } : {}),
  ...(typeof event.pillagedGold === "number" ? { pillagedGold: event.pillagedGold } : {}),
  ...(event.pillagedStrategic ? { pillagedStrategic: event.pillagedStrategic } : {}),
  ...(event.combatResult ? { changes: event.combatResult.changes, defenderOwnerId: event.combatResult.defenderOwnerId } : {})
});

// The defender never learns what a successful raid actually cost them —
// TILE_DELTA_BATCH flips the tile visually, but no message ever carried the
// gold/resources pillaged from their side. Returns undefined when the event
// isn't a defender-losing ATTACK (EXPAND onto neutral land has no defender;
// a beaten-back attack pillages nothing).
export const raidResultDefenderId = (event: CombatResolvedEvent): string | undefined => {
  const defenderOwnerId = event.combatResult?.defenderOwnerId;
  if (event.actionType !== "ATTACK" || !event.attackerWon || !defenderOwnerId || defenderOwnerId === event.playerId) return undefined;
  return defenderOwnerId;
};

export const raidResultPayloadForDefender = (event: CombatResolvedEvent): Record<string, unknown> => ({
  type: "RAID_RESULT",
  commandId: event.commandId,
  attackerId: event.playerId,
  target: { x: event.targetX, y: event.targetY },
  ...(typeof event.pillagedGold === "number" ? { pillagedGold: event.pillagedGold } : {}),
  ...(event.pillagedStrategic ? { pillagedStrategic: event.pillagedStrategic } : {})
});

// Sends both halves of a resolved combat's outcome to whichever of the two
// sides `socketPlayerId` belongs to, if either. One-line call site for
// gateway-app.ts's per-socket dispatch loop.
export const sendCombatResolvedPayload = (
  event: CombatResolvedEvent,
  socketPlayerId: string | undefined,
  send: (payload: Record<string, unknown>) => void
): void => {
  if (socketPlayerId === event.playerId) send(combatResultPayloadForAttacker(event));
  else if (socketPlayerId && socketPlayerId === raidResultDefenderId(event)) send(raidResultPayloadForDefender(event));
};

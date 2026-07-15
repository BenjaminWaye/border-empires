import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { IMPERIAL_WARD_DURATION_MS } from "@border-empires/game-domain";
import { IMPERIAL_WARD_ACTIVE_UNTIL_KEY } from "./runtime-ability-helpers.js";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";

// Parses StartNextSeasonRequest.imperial_ward_json (gateway -> sim RPC) into
// the pendingImperialWard grant consumed once by
// SimulationRuntime.ensurePlayerHasSpawnTerritory.
export function parsePendingImperialWard(value: string | undefined): { playerId: string; charges: number } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { playerId?: unknown; charges?: unknown };
    if (typeof parsed.playerId !== "string" || !parsed.playerId) return undefined;
    if (typeof parsed.charges !== "number" || !Number.isFinite(parsed.charges) || parsed.charges <= 0) return undefined;
    return { playerId: parsed.playerId, charges: Math.floor(parsed.charges) };
  } catch {
    return undefined;
  }
}

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Manual activation,
// no anchor tile — a pure per-player toggle. Burns one of the player's
// `imperialWardCharges` (granted once at season-start for the endorsed
// player) and gives 10 minutes of total invulnerability on all owned tiles
// (enforced at ATTACK-lock creation time; see runtime-frontier-command.ts).
export function handleActivateImperialWardCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  const chargesRemaining = actor.imperialWardCharges ?? 0;
  if (chargesRemaining <= 0) {
    rejectCommand(context, command, "IMPERIAL_WARD_INVALID", "no imperial ward charges remaining");
    return;
  }
  const now = context.now();
  if (context.getAbilityCooldownUntil(actor.id, IMPERIAL_WARD_ACTIVE_UNTIL_KEY) > now) {
    rejectCommand(context, command, "IMPERIAL_WARD_INVALID", "imperial ward already active");
    return;
  }
  const activeUntil = now + IMPERIAL_WARD_DURATION_MS;
  actor.imperialWardCharges = chargesRemaining - 1;
  context.setAbilityCooldownUntil(actor.id, IMPERIAL_WARD_ACTIVE_UNTIL_KEY, activeUntil);
  context.emitPlayerMessage(command, {
    type: "IMPERIAL_WARD_ACTIVATED",
    activeUntil,
    chargesRemaining: actor.imperialWardCharges
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

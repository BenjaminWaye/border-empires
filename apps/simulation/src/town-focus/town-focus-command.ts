// SET_TOWN_FOCUS (docs/town-focus-plan.md): switch a list of the sender's towns
// to one focus. A town that changes is locked until the owner's next manpower
// refill; locked and ungarrisoned towns are skipped. The choice is stored as pending and made active by the
// promotion step after the next population growth tick (at most a minute), so
// every growth tick, Coin second and manpower second is paid at the focus that
// was really in force: switching back and forth gains nothing. Free, so it is bounded: the schema caps the list, duplicate
// tiles are ignored, tiles the sender does not own are skipped while the rest
// apply, and a town whose queued focus would not change is not written.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { SetTownFocusMessageSchema, nextManpowerRefillAtMs, queueTownFocus, townFocusLocked } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { rejectCommand } from "../runtime-structure-command-handlers-reject.js";
import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type TownFocusCommandContext = Pick<
  RuntimeStructureCommandContext,
  "players" | "tiles" | "now" | "emitEvent" | "replaceTileState" | "tileDeltaFromState"
>;

const TownFocusPayloadSchema = SetTownFocusMessageSchema.pick({ tiles: true, focus: true });

const parsePayload = (payloadJson: string): ReturnType<typeof TownFocusPayloadSchema.safeParse> | undefined => {
  try {
    return TownFocusPayloadSchema.safeParse(JSON.parse(payloadJson));
  } catch {
    return undefined;
  }
};

export const handleSetTownFocusCommand = (context: TownFocusCommandContext, command: CommandEnvelope): void => {
  const parsed = parsePayload(command.payloadJson);
  if (!parsed?.success || !context.players.has(command.playerId)) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  // Due now: the promotion step after the next growth tick settles the old rates and applies it.
  const effectiveAt = context.now();
  const lockedUntil = nextManpowerRefillAtMs(command.playerId, effectiveAt);
  const seen = new Set<string>();
  const written: DomainTileState[] = [];
  let ownedTowns = 0;
  let lockedTowns = 0;
  for (const { x, y } of parsed.data.tiles) {
    const tileKey = simulationTileKey(x, y);
    if (seen.has(tileKey)) continue;
    seen.add(tileKey);
    const tile = context.tiles.get(tileKey);
    // Only a garrisoned town takes a focus: the promotion step walks settled towns.
    if (!tile?.town || tile.ownerId !== command.playerId || tile.ownershipState !== "SETTLED") continue;
    ownedTowns += 1;
    if (townFocusLocked(tile.town, effectiveAt)) {
      lockedTowns += 1;
      continue;
    }
    const queued = queueTownFocus(tile.town, parsed.data.focus, effectiveAt);
    if (queued === tile.town) continue;
    const next: DomainTileState = { ...tile, town: { ...queued, focusLockedUntil: lockedUntil } };
    context.replaceTileState(tileKey, next, command.commandId);
    written.push(next);
  }
  if (ownedTowns === 0) {
    rejectCommand(context, command, "TOWN_FOCUS_INVALID", "none of those towns are yours");
    return;
  }
  if (written.length === 0 && lockedTowns > 0) {
    rejectCommand(context, command, "TOWN_FOCUS_LOCKED", "that town's focus is locked until your next refill");
    return;
  }
  if (written.length > 0) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: command.commandId,
      playerId: command.playerId,
      tileDeltas: written.map((tile) => context.tileDeltaFromState(tile))
    });
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

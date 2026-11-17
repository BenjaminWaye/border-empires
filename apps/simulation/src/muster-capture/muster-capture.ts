import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  MUSTER_CAPTURED_MESSAGE_TYPE,
  MUSTER_LOST_MESSAGE_TYPE,
  type MusterCapturedPayload,
  type MusterLostPayload
} from "@border-empires/shared";

import type { PersonalImpactMuster } from "../personal-impact-log/personal-impact-log.js";
import { isAiControlledActor } from "../runtime-player-factory.js";
import { manpowerCeiling } from "../runtime-manpower-ceiling.js";

type PlayerMessageEvent = {
  eventType: "PLAYER_MESSAGE";
  commandId: string;
  playerId: string;
  messageType: string;
  payloadJson: string;
};

export type MusterCaptureContext = {
  players: ReadonlyMap<string, DomainPlayer>;
  playerManpowerCap: (player: DomainPlayer) => number;
  now: () => number;
  emitEvent: (event: PlayerMessageEvent) => void;
  recordPersonalImpact?: (event: PersonalImpactMuster) => void;
};

export type MusterCaptureInput = {
  commandId: string;
  captorId: string;
  x: number;
  y: number;
  muster: DomainTileState["muster"];
};

export type MusterCaptureResult = { amount: number; gained: number; flagOwnerId: string };

/**
 * A muster flag falls with the tile it stands on. Its staged manpower moves to
 * the captor, clamped to their manpower ceiling (cap plus any unspent reserve
 * overflow); the remainder is lost. Barbarians have no manpower pool, so a
 * flag they take is simply destroyed. A captor already at or above their
 * ceiling (e.g. a cap that dropped and is not yet settled) gains nothing and
 * is never pushed down. Human players on either side get a PLAYER_MESSAGE
 * (map label and feed) and a Chronicle entry; AI empires get neither, since
 * nobody reads them and the impact log is shared and bounded. The flag itself is already gone:
 * the captured tile never carries `muster` forward (runtime-winning-capture.ts).
 */
export const applyMusterFlagCapture = (context: MusterCaptureContext, input: MusterCaptureInput): MusterCaptureResult | undefined => {
  const { muster, captorId } = input;
  if (!muster || muster.ownerId === captorId) return undefined;
  const amount = Math.max(0, Math.floor(muster.amount));
  if (amount <= 0) return undefined;
  const flagOwnerId = muster.ownerId;
  const captor = captorId === "barbarian-1" ? undefined : context.players.get(captorId);
  let gained = 0;
  if (captor) {
    const before = Math.max(0, captor.manpower);
    const room = Math.max(0, manpowerCeiling(captor, context.playerManpowerCap(captor)) - before);
    gained = Math.floor(Math.min(amount, room));
    captor.manpower = before + gained;
  }
  const occurredAt = context.now();
  const at = { x: input.x, y: input.y };
  if (captor && !isAiControlledActor(captorId, captor.isAi)) {
    context.recordPersonalImpact?.({ id: `muster-captured:${input.commandId}`, kind: "MUSTER_CAPTURED", playerId: captorId, occurredAt, ...at, amount, gained, counterpartyPlayerId: flagOwnerId });
    const payload: MusterCapturedPayload = { type: MUSTER_CAPTURED_MESSAGE_TYPE, ...at, amount, gained, fromPlayerId: flagOwnerId };
    context.emitEvent({ eventType: "PLAYER_MESSAGE", commandId: `muster-captured:${input.commandId}`, playerId: captorId, messageType: payload.type, payloadJson: JSON.stringify(payload) });
  }
  const flagOwner = context.players.get(flagOwnerId);
  if (flagOwner && !isAiControlledActor(flagOwnerId, flagOwner.isAi)) {
    context.recordPersonalImpact?.({ id: `muster-lost:${input.commandId}`, kind: "MUSTER_LOST", playerId: flagOwnerId, occurredAt, ...at, amount, counterpartyPlayerId: captorId });
    const payload: MusterLostPayload = { type: MUSTER_LOST_MESSAGE_TYPE, ...at, amount, byPlayerId: captorId };
    context.emitEvent({ eventType: "PLAYER_MESSAGE", commandId: `muster-lost:${input.commandId}`, playerId: flagOwnerId, messageType: payload.type, payloadJson: JSON.stringify(payload) });
  }
  return { amount, gained, flagOwnerId };
};

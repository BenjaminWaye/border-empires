// Helpers shared between the in-process and worker-thread AI command
// producers when they wire commands into the intent latch. Extracted from the
// initial port (PR #194) where these were duplicated across both producer
// files.
//
// Wake windows track the *resolution* duration of each command so the latch
// expires shortly after the runtime finishes processing the action. The grace
// values absorb scheduler jitter between the runtime emitting a terminal
// event and the producer's event handler clearing the latch — without it, a
// late-arriving event would race the wake-window expiry.

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS } from "@border-empires/shared";

import type { AiLatchedIntentKind } from "./ai-intent-latch.js";

const FRONTIER_LATCH_GRACE_MS = 500;

export const FRONTIER_INTENT_WAKE_MS = COMBAT_LOCK_MS + FRONTIER_LATCH_GRACE_MS;

export const intentKindForCommand = (commandType: CommandEnvelope["type"]): AiLatchedIntentKind | undefined => {
  // BUILD_* commands intentionally not latched — their resolution timing
  // varies per structure, and the existing pendingCommand tracker already
  // handles "skip while in flight." Adding them here without a wake window
  // would create a confusing dead branch in the producer.
  if (commandType === "ATTACK" || commandType === "EXPAND") return "frontier";
  return undefined;
};

export const wakeWindowMsForCommand = (commandType: CommandEnvelope["type"]): number => {
  if (commandType === "ATTACK" || commandType === "EXPAND") return FRONTIER_INTENT_WAKE_MS;
  return 0;
};

export const extractTargetTileKey = (command: CommandEnvelope): string | undefined => {
  try {
    const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
    if (typeof payload.toX === "number" && typeof payload.toY === "number") {
      return `${payload.toX},${payload.toY}`;
    }
    if (typeof payload.x === "number" && typeof payload.y === "number") {
      return `${payload.x},${payload.y}`;
    }
  } catch {
    /* malformed payload — caller treats as no key */
  }
  return undefined;
};

export const extractOriginTileKey = (command: CommandEnvelope): string | undefined => {
  try {
    const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
    if (typeof payload.fromX === "number" && typeof payload.fromY === "number") {
      return `${payload.fromX},${payload.fromY}`;
    }
  } catch {
    /* malformed payload — caller treats as no key */
  }
  return undefined;
};

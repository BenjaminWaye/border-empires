// Durable-command payload for a client SET_MUSTER, pulled out of
// gateway-app.ts's already-oversized dispatch chain (see
// check-file-line-limits.mjs). The simulation's parseSetMusterPayload
// (runtime-command-parsers.ts) reads commitManpower from here and stores it on
// the flag, where MARCH/ADVANCE auto-fire carries it into the ATTACK it
// launches (docs/replenishment-update-plan.md D6). Dropping it here silently
// reset every flag to the floor commitment -- the player's Extra/Double
// effort never reached the roll, so the battle card showed base odds.
export type SetMusterClientMessage = {
  x: number;
  y: number;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  targetX?: number | undefined;
  targetY?: number | undefined;
  commitManpower?: number | undefined;
};

export type SetMusterCommandPayload = {
  x: number;
  y: number;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  targetX?: number;
  targetY?: number;
  commitManpower?: number;
};

export const setMusterCommandPayload = (message: SetMusterClientMessage): SetMusterCommandPayload => ({
  x: message.x,
  y: message.y,
  mode: message.mode,
  ...(typeof message.targetX === "number" ? { targetX: message.targetX } : {}),
  ...(typeof message.targetY === "number" ? { targetY: message.targetY } : {}),
  ...(typeof message.commitManpower === "number" ? { commitManpower: message.commitManpower } : {})
});

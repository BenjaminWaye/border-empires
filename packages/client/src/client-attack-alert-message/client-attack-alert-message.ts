import type { ClientState } from "../client-state/client-state.js";

type FeedEntryInput = {
  text: string;
  type?: string;
  severity?: string;
  feedOnly?: boolean;
  at?: number;
  focusX?: number;
  focusY?: number;
  actionLabel?: string;
};

export type AttackAlertMessageDeps = {
  state: Pick<ClientState, "incomingAttacksByTile" | "unreadAttackAlerts">;
  keyFor: (x: number, y: number) => string;
  appendFeedEntry: (entry: FeedEntryInput) => void;
};

// Applies an ATTACK_ALERT (sent to the defender when an attack on their tile is
// accepted): records it in state.incomingAttacksByTile, which drives the red
// under-attack cross, the battle sweep and the defender's skirmish in both
// renderers, and posts the "Under attack" feed line. Pulled out of
// client-network.ts (over the repo's 500-line limit) unchanged.
export const applyAttackAlertMessage = (msg: Record<string, unknown>, deps: AttackAlertMessageDeps): void => {
  const { state, keyFor, appendFeedEntry } = deps;
  const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
  const x = Number(msg.x ?? -1);
  const y = Number(msg.y ?? -1);
  const resolvesAt = Number(msg.resolvesAt ?? Date.now() + 3000);
  const fromX = typeof msg.fromX === "number" ? Number(msg.fromX) : undefined;
  const fromY = typeof msg.fromY === "number" ? Number(msg.fromY) : undefined;
  const attackerId = typeof msg.attackerId === "string" ? msg.attackerId : undefined;
  const transitEndsAt = typeof msg.transitEndsAt === "number" ? Number(msg.transitEndsAt) : undefined;
  if (x >= 0 && y >= 0) {
    state.incomingAttacksByTile.set(keyFor(x, y), {
      attackerName,
      resolvesAt,
      ...(attackerId !== undefined ? { attackerId } : {}),
      ...(fromX !== undefined ? { fromX } : {}),
      ...(fromY !== undefined ? { fromY } : {}),
      ...(transitEndsAt !== undefined ? { transitEndsAt } : {}),
      ...(typeof msg.winChance === "number" ? { winChance: msg.winChance } : {})
    });
  }
  state.unreadAttackAlerts += 1;
  appendFeedEntry({
    text: `Under attack: ${attackerName} is striking (${x}, ${y})${fromX !== undefined && fromY !== undefined ? ` from (${fromX}, ${fromY})` : ""}.`,
    type: "combat",
    severity: "error",
    feedOnly: true,
    at: Date.now(),
    focusX: x,
    focusY: y,
    actionLabel: "Center"
  });
};

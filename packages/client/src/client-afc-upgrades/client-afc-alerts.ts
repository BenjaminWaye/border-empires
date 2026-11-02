import type { FeedEntry } from "../client-types.js";

/**
 * AETHER_HIJACK_ALERT: an enemy started a Resonance Hijack on one of our towers.
 * The takeover finishes at `endsAt` unless we take, suppress or unpower their
 * casting tower, so the entry centres on the caster, not on our own tower.
 */
export const aetherHijackAlertFeedEntry = (msg: Record<string, unknown>, now = Date.now()): FeedEntry => {
  const attackerName = (typeof msg.attackerName === "string" && msg.attackerName) || (typeof msg.attackerId === "string" && msg.attackerId) || "An enemy empire";
  const x = Number(msg.x ?? -1), y = Number(msg.y ?? -1), casterX = Number(msg.casterX ?? -1), casterY = Number(msg.casterY ?? -1);
  const minutes = Math.max(1, Math.ceil((Number(msg.endsAt ?? now) - now) / 60_000));
  return {
    text: `Tower hijack! ${attackerName} is taking over our Aether Tower at (${x}, ${y}) — it falls in ${minutes} min unless we take, suppress or cut power to their tower at (${casterX}, ${casterY}).`,
    type: "combat",
    severity: "error",
    at: now,
    ...(casterX >= 0 && casterY >= 0 ? { focusX: casterX, focusY: casterY, actionLabel: "Find their tower" } : {})
  };
};

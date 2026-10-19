import type { RecoveredPlayerState } from "./event-recovery-player-state.js";

/** Apply the durable social sync event to a checkpoint's two-sided relationship. */
export const applyRecoveredDiplomacy = (players: RecoveredPlayerState[], playerId: string, payloadJson: string): void => {
  let payload: { targetPlayerId?: unknown; truced?: unknown; allied?: unknown };
  try { payload = JSON.parse(payloadJson); } catch { return; }
  if (!payload || typeof payload.targetPlayerId !== "string" || payload.targetPlayerId === playerId) return;
  const actor = players.find(player => player.id === playerId);
  const target = players.find(player => player.id === payload.targetPlayerId);
  if (!actor || !target) return;
  for (const [key, active] of [["truces", payload.truced], ["allies", payload.allied]] as const) {
    if (typeof active !== "boolean") continue;
    for (const [player, partner] of [[actor, target], [target, actor]] as const) {
      const members = new Set(player[key] ?? []);
      if (active) members.add(partner.id);
      else members.delete(partner.id);
      player[key] = [...members].sort();
    }
  }
};

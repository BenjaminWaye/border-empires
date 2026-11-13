import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { focusFromAlert } from "../client-alerts/client-alerts.js";
import { recordMusterCombatReport, type CombatReportAlert } from "../client-muster-combat-reports/client-muster-combat-reports.js";
import { shouldShowMusterBattleCard, showMusterBattleCard } from "../client-muster-combat-reports/client-muster-battle-alert.js";

type CombatFeedEntry = {
  title: string; text: string; type: "combat"; severity: "success" | "warn"; at: number;
  focusX?: number; focusY?: number; actionLabel?: string;
};
interface CombatNotificationDeps {
  keyFor: (x: number, y: number) => string;
  combatResolutionAlert: (msg: Record<string, unknown>, context: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }) => CombatReportAlert;
  wasPredictedCombatAlreadyShown: (revealed: ClientState["revealedPredictedCombatByKey"], key: string, title: string, detail: string) => boolean;
  appendFeedEntry: (entry: CombatFeedEntry) => void;
  showCaptureAlert: (title: string, detail: string, tone: "success" | "warn", loss?: number, focus?: { x: number; y: number; actionLabel?: string }) => void;
}

/** Flag reports stay reviewable per flag; a MARCH attack also gets a (tallied) result card. */
export const notifyCombatResult = (
  state: ClientState, msg: Record<string, unknown>,
  context: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined },
  flagKey: string | undefined, deps: CombatNotificationDeps
): { resultAlert: CombatReportAlert; resultTargetKey: string } => {
  const resultAlert = deps.combatResolutionAlert(msg, context);
  const target = msg.target as { x: number; y: number } | undefined;
  const resultTargetKey = target ? deps.keyFor(target.x, target.y) : "";
  const predictedAlreadyShown = Boolean(
    (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey &&
      state.pendingCombatReveal.revealed && state.pendingCombatReveal.title === resultAlert.title &&
      state.pendingCombatReveal.detail === resultAlert.detail) ||
    (resultTargetKey && deps.wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
  );
  const silentExpandSuccess = Boolean(state.capture?.silent && msg.attackType === "EXPAND" && resultAlert.tone === "success");
  if (flagKey) recordMusterCombatReport(state, msg, flagKey, resultAlert);
  if (!predictedAlreadyShown && !silentExpandSuccess) {
    deps.appendFeedEntry({
      title: resultAlert.title, text: resultAlert.detail, type: "combat",
      severity: resultAlert.tone === "success" ? "success" : "warn", at: Date.now(),
      ...(typeof resultAlert.focusX === "number" && typeof resultAlert.focusY === "number"
        ? { focusX: resultAlert.focusX, focusY: resultAlert.focusY, actionLabel: resultAlert.actionLabel ?? "Center" } : {})
    });
    if (!flagKey) deps.showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss, focusFromAlert(resultAlert));
    else if (shouldShowMusterBattleCard(msg)) showMusterBattleCard(state, flagKey, msg.attackerWon === true, resultAlert);
  }
  return { resultAlert, resultTargetKey };
};

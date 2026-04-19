import type { ClientState } from "./client-state.js";

type CaptureAlertState = Pick<ClientState, "actionCurrent" | "actionAcceptedAck" | "captureAlert">;
type FrontierActionType = "ATTACK" | "BREAKTHROUGH_ATTACK" | "EXPAND" | undefined;

const recoveryTitleForAction = (actionType: FrontierActionType): string => {
  switch (actionType) {
    case "ATTACK":
      return "Recovering attack";
    case "BREAKTHROUGH_ATTACK":
      return "Recovering breakthrough";
    case "EXPAND":
      return "Recovering expansion";
    default:
      return "Recovering frontier action";
  }
};

const managedTitles = new Set<string>([
  "Recovering attack",
  "Recovering breakthrough",
  "Recovering expansion",
  "Recovering frontier action"
]);

export const showRecoveredFrontierAlert = (
  state: CaptureAlertState,
  showCaptureAlert: (title: string, detail: string, tone?: "info" | "success" | "error" | "warn") => void
): void => {
  const detail = state.actionAcceptedAck ? "Combat should resume as the gateway resyncs the action." : "Waiting for server confirmation after reconnect.";
  showCaptureAlert(recoveryTitleForAction(state.actionCurrent?.actionType), detail, "warn");
};

export const clearFrontierStatusAlert = (state: Pick<ClientState, "captureAlert">): void => {
  if (!state.captureAlert || !managedTitles.has(state.captureAlert.title)) return;
  state.captureAlert = undefined;
};

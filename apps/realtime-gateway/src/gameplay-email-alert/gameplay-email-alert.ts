import type { EmailAlertOutcome } from "../email-alerts/email-alerts.js";

export type GameplayEmailAlertKind = "alliance_request" | "alliance_break" | "truce_request" | "attack" | "season_start";

export type SendGameplayEmailAlert = (kind: GameplayEmailAlertKind, recipientPlayerId: string, send: () => Promise<EmailAlertOutcome>) => void;

export const createGameplayEmailAlertSender = (deps: {
  recordGatewayEvent: (level: "info" | "warn", event: string, payload: Record<string, unknown>) => void;
  logError: (payload: unknown, message: string) => void;
}): SendGameplayEmailAlert => {
  const recordOutcome = (kind: GameplayEmailAlertKind, recipientPlayerId: string, outcome: EmailAlertOutcome): void => {
    if (outcome === "disabled" || outcome === "recipient_missing") return;
    const level = outcome === "send_failed" ? "warn" : "info";
    deps.recordGatewayEvent(level, "gateway_email_alert_result", { kind, recipientPlayerId, outcome });
  };

  return (kind, recipientPlayerId, send) => {
    void send()
      .then((outcome) => recordOutcome(kind, recipientPlayerId, outcome))
      .catch((error) => {
        deps.logError({ err: error instanceof Error ? error.message : String(error), kind, recipientPlayerId }, "gameplay email alert failed");
      });
  };
};

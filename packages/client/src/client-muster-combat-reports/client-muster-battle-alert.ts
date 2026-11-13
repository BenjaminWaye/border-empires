import type { ClientState } from "../client-state/client-state.js";
import type { CombatReportAlert } from "./client-muster-combat-reports.js";

// A MARCH flag's attacks are a fight the player ordered against a chosen
// target, so their outcome gets the result card a manual attack gets
// (2026-11-12 playtest: a march attack's win/loss was only visible in the
// flag's Recent combat tab, so the attacker never saw it). ADVANCE patrols
// stay quiet (reports tab + feed only, as before), and the march's neutral
// claims on the way never show a card.
//
// Several march fights can resolve while a card is up. Instead of replacing
// the card with each one (the repeated overlays that made flag reports quiet
// in the first place), later results fold into one tally for that flag.
export const isMarchCommandId = (commandId: unknown): boolean =>
  typeof commandId === "string" && commandId.startsWith("territory-auto:muster-march:");

export const shouldShowMusterBattleCard = (msg: Record<string, unknown>): boolean =>
  isMarchCommandId(msg.commandId) && msg.attackType === "ATTACK";

type CaptureAlert = NonNullable<ClientState["captureAlert"]>;
const CARD_MS = 12_000;

export const showMusterBattleCard = (
  state: Pick<ClientState, "captureAlert">,
  flagKey: string,
  won: boolean,
  alert: CombatReportAlert,
  nowMs: number = Date.now()
): void => {
  const prev = state.captureAlert;
  const tally = prev && prev.until > nowMs && prev.musterFlagKey === flagKey ? prev.musterTally : undefined;
  const wins = (tally?.won ?? 0) + (won ? 1 : 0);
  const losses = (tally?.lost ?? 0) + (won ? 0 : 1);
  const loss = (tally ? (prev?.manpowerLoss ?? 0) : 0) + (alert.manpowerLoss ?? 0);
  const [fx, fy] = flagKey.split(",");
  const next: CaptureAlert = {
    title: tally ? `Flag (${fx}, ${fy}): ${wins} won · ${losses} lost` : alert.title,
    detail: alert.detail,
    until: nowMs + CARD_MS,
    tone: losses > 0 ? "warn" : "success",
    ...(loss > 0 ? { manpowerLoss: loss } : {}),
    ...(typeof alert.focusX === "number" && typeof alert.focusY === "number"
      ? { focusX: alert.focusX, focusY: alert.focusY, actionLabel: alert.actionLabel ?? "Center" }
      : {}),
    musterFlagKey: flagKey,
    musterTally: { won: wins, lost: losses }
  };
  state.captureAlert = next;
};

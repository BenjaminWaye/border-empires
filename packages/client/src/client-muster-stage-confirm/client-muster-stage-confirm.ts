// "Stage Muster" used to send SET_MUSTER the moment it was tapped. Its
// description lives in the button's tooltip, which a phone never shows, so a
// player tapping it to find out what it does found out by staging manpower
// (2026-11-12 playtest, pt-optimiser). The first time an account stages a
// flag it now gets a short confirm saying what happens and how to undo it;
// after that the button acts at once, so a player who knows mustering isn't
// slowed down. Remembered per account in localStorage only: a fresh browser
// shows the sheet once more, which costs one extra tap.
import { showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";

const MUSTER_STAGE_EXPLAINED_STORAGE_KEY = "be-muster-stage-explained";

const scopedKey = (authEmail?: string | null): string => `${MUSTER_STAGE_EXPLAINED_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

export const isMusterStageExplained = (authEmail: string | null | undefined): boolean => {
  try {
    return window.localStorage.getItem(scopedKey(authEmail)) === "1";
  } catch {
    return false;
  }
};

const markMusterStageExplained = (authEmail: string | null | undefined): void => {
  try {
    window.localStorage.setItem(scopedKey(authEmail), "1");
  } catch {
    // Restricted storage: the sheet just shows again next time.
  }
};

/** What staging a flag does, one short line each. */
export const stageMusterConsequences = (flagCap: number): string[] => [
  `Moves up to ${flagCap} manpower from your pool onto this tile over time.`,
  "Clear Muster returns it to your pool.",
  "Set Advance or March To from the flag to attack with it."
];

/**
 * Runs `proceed` straight away once the account has staged a flag before;
 * otherwise asks first. Also proceeds when no sheet can be shown (no DOM), so
 * the button never silently does nothing.
 */
export const confirmFirstMusterStage = (input: {
  authEmail: string | null | undefined;
  flagCap: number;
  x: number;
  y: number;
  proceed: () => void;
  show?: (options: BreakPactSheetOptions) => boolean;
}): void => {
  const { authEmail, proceed } = input;
  if (isMusterStageExplained(authEmail)) return proceed();
  const confirm = (): void => {
    markMusterStageExplained(authEmail);
    proceed();
  };
  const shown = (input.show ?? showBreakPactSheet)({
    title: "Stage Muster?",
    subtitle: `Raises a muster flag on (${input.x}, ${input.y}).`,
    consequences: stageMusterConsequences(input.flagCap),
    confirmLabel: "Stage Muster",
    onConfirm: confirm
  });
  if (!shown) proceed();
};

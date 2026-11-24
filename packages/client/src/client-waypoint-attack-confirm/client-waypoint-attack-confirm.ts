// Expand To asks before it fights (owner rule, Playtest Run 4 follow-up). The route to an empty tile can run
// through barbarian or rival land, and each step there is an ATTACK that raises a muster flag when none is near (parkOrReuseMusterFlagForAttack). The menu row's
// "2 expand + 1 attack" was the only warning, so a click could start a war. Now Expand To asks first.
import type { WaypointPlan } from "@border-empires/shared";
import { showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import type { ClientState } from "../client-state/client-state.js";

type NameState = Pick<ClientState, "tiles" | "me" | "meName" | "playerNames" | "leaderboard">;

/** Who the route attacks, each named once, in route order: "barbarians" or the empire's name. */
export const waypointAttackedOwners = (plan: WaypointPlan, state: NameState, keyFor: (x: number, y: number) => string): string[] => {
  const names: string[] = [];
  for (const step of plan.steps) {
    if (step.action !== "ATTACK") continue;
    const ownerId = state.tiles.get(keyFor(step.target.x, step.target.y))?.ownerId;
    const name = ownerId?.startsWith("barbarian-") ? "barbarians" : playerDisplayNameForOwnerFromState(state, ownerId) ?? "another empire";
    if (!names.includes(name)) names.push(name);
  }
  return names;
};

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Runs `proceed` straight away when the route has no attacks; otherwise asks first and runs it on confirm.
 * Proceeds when no sheet can be shown (no DOM), so the action never silently does nothing.
 */
export const confirmWaypointAttacks = (
  plan: WaypointPlan,
  state: NameState,
  keyFor: (x: number, y: number) => string,
  proceed: () => void,
  show: (options: BreakPactSheetOptions) => boolean = showBreakPactSheet
): void => {
  if (plan.attackCount <= 0) return proceed();
  const attacks = plan.attackCount === 1 ? "1 attack" : `${plan.attackCount} attacks`;
  const shown = show({
    title: "Attack on the way?",
    subtitle: `The way there goes through land held by ${joinNames(waypointAttackedOwners(plan, state, keyFor))}.`,
    consequences: [`${attacks} on the way, up to ${plan.totalManpower} manpower in all.`, "A muster flag is raised to fund them if none is near.", "Attacks can fail."],
    confirmLabel: "Expand and attack",
    onConfirm: proceed
  });
  if (!shown) proceed();
};

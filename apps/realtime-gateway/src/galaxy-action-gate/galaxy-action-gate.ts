// §21.12: one discretionary action per weekly Cycle. Defend posture, Probes
// and answering a Writ are never gated. Pure logic -- not yet wired to routes.
export const ACTION_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

export type GatedActionKind = "INVEST" | "PETITION_SENATE" | "GIVE_ORDER";
export type UngatedActionKind = "DEFEND_POSTURE" | "BODY_SURVEY" | "ANSWER_WRIT";
export type GalaxyActionKind = GatedActionKind | UngatedActionKind;

const UNGATED: ReadonlySet<GalaxyActionKind> = new Set(["DEFEND_POSTURE", "BODY_SURVEY", "ANSWER_WRIT"]);

export const isGatedAction = (kind: GalaxyActionKind): kind is GatedActionKind => !UNGATED.has(kind);

export type ActionGateState = { lastGatedActionAt: number | null };

export type ActionGateResult =
  | { ok: true; state: ActionGateState }
  | { ok: false; code: "ACTION_ALREADY_TAKEN_THIS_CYCLE"; availableAt: number };

export const nextActionAvailableAt = (state: ActionGateState): number =>
  state.lastGatedActionAt === null ? 0 : state.lastGatedActionAt + ACTION_CYCLE_MS;

export const tryTakeAction = (state: ActionGateState, kind: GalaxyActionKind, now: number): ActionGateResult => {
  if (!isGatedAction(kind)) return { ok: true, state };
  const availableAt = nextActionAvailableAt(state);
  if (now < availableAt) return { ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt };
  return { ok: true, state: { lastGatedActionAt: now } };
};

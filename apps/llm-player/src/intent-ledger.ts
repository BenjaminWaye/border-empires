// Tracks fire-and-forget commands (BUILD_ECONOMIC_STRUCTURE, CHOOSE_TECH) until
// their effect is observed, so the bot learns whether they landed instead of
// logging "sent" and assuming success.
//
// Neither command carries a client commandId, so there is no ack to correlate.
// Two signals exist instead:
//   - success: the effect shows up in state (techIds via TECH_UPDATE; a
//     structure as economicStructureJson on the tile -- a build goes straight
//     to status "under_construction" at accept time, see apps/simulation/src/
//     runtime-structure-command-handlers.ts).
//   - rejection: the gateway sends the submitting player an ERROR whose
//     commandId is server-generated (apps/realtime-gateway/src/gateway-app/
//     gateway-app.ts's COMMAND_REJECTED branch), which GameSession captures as
//     an UnmatchedError. It can't be matched by id, so it's attributed to the
//     most recently sent intent that precedes it: the gateway rejects within
//     moments of receiving a command, whereas an older still-pending intent has
//     already had at least a full turn to show its effect. It is still a
//     heuristic, hence the "probable" wording shown to the model. A rejection
//     arriving after its intent already expired as "unconfirmed" upgrades that
//     outcome instead of being dropped.
//     Gateway-level ERRORs with no commandId (rate limits, bad messages) are
//     not command rejections and are never captured, so they can't be
//     misattributed here.
// All state here is bounded (see docs/agents/state-and-persistence-
// discipline.md): pending is capped, outcomes are a short ring, cooldown keys
// expire.
import type { EconomicStructureType } from "@border-empires/shared";
import type { GameInitState, UnmatchedError } from "./game-socket.js";
import { buildTileIndex, economicStructureType } from "./viewport.js";
import { tileKey } from "./wire-parsers.js";

export type Intent =
  | { kind: "TECH"; techId: string }
  | { kind: "STRUCTURE"; x: number; y: number; structureType: EconomicStructureType };

export type OutcomeStatus = "confirmed" | "rejected" | "unconfirmed";
export type Outcome = { intent: Intent; status: OutcomeStatus; turn: number; code?: string; message?: string };

type PendingIntent = { intent: Intent; sentAtTurn: number; sentAtMs: number };
type RecordedOutcome = { outcome: Outcome; sentAtMs: number };

export type ReconcileInput = {
  turn: number;
  techIds: readonly string[];
  // economicStructure.type on the tile at (x, y), if any.
  structureTypeAt: (x: number, y: number) => string | undefined;
  errors: readonly UnmatchedError[];
};

const MAX_PENDING = 10;
const MAX_OUTCOMES = 5;
// Turns after which an intent with no observable effect and no attributable
// error is reported as unconfirmed rather than left pending forever.
const EXPIRE_AFTER_TURNS = 3;
// Turns a rejected/unconfirmed (x, y, type) or tech stays out of the offered
// choices, so the model doesn't immediately re-send the same doomed command.
const COOLDOWN_TURNS = 5;

const describeIntent = (intent: Intent): string =>
  intent.kind === "TECH"
    ? `CHOOSE_TECH(${intent.techId})`
    : `BUILD_ECONOMIC_STRUCTURE(${intent.structureType}) at (${intent.x},${intent.y})`;

const pendingKey = (intent: Intent): string => (intent.kind === "TECH" ? `tech:${intent.techId}` : `tile:${intent.x},${intent.y}`);
const cooldownKey = (intent: Intent): string =>
  intent.kind === "TECH" ? `tech:${intent.techId}` : `tile:${intent.x},${intent.y}:${intent.structureType}`;

export class IntentLedger {
  private pending: PendingIntent[] = [];
  private outcomes: RecordedOutcome[] = [];
  private lastTurn = 0;
  private readonly cooldownUntilTurn = new Map<string, number>();

  record(intent: Intent, turn: number, nowMs: number): void {
    // Re-sending the identical command must not create a second entry -- one
    // rejection would only resolve one of them, leaving a phantom pending. A
    // different structure type on the same tile is a distinct command and is
    // still tracked.
    if (this.pending.some((entry) => cooldownKey(entry.intent) === cooldownKey(intent))) return;
    this.pending.push({ intent, sentAtTurn: turn, sentAtMs: nowMs });
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
  }

  // Resolves what it can and returns the newly resolved outcomes (oldest first).
  reconcile(input: ReconcileInput): Outcome[] {
    this.lastTurn = input.turn;
    const resolved: Outcome[] = [];
    const recorded: RecordedOutcome[] = [];
    const resolve = (entry: PendingIntent, status: OutcomeStatus, error?: UnmatchedError): void => {
      const outcome: Outcome = {
        intent: entry.intent,
        status,
        turn: input.turn,
        ...(error ? { code: error.code, message: error.message } : {})
      };
      resolved.push(outcome);
      recorded.push({ outcome, sentAtMs: entry.sentAtMs });
      this.pending = this.pending.filter((candidate) => candidate !== entry);
      if (status !== "confirmed") this.cooldownUntilTurn.set(cooldownKey(entry.intent), input.turn + COOLDOWN_TURNS);
    };

    // Confirmations first: an error must never be pinned on an older intent
    // that has in fact already landed.
    for (const entry of [...this.pending]) {
      const { intent } = entry;
      const landed =
        intent.kind === "TECH" ? input.techIds.includes(intent.techId) : input.structureTypeAt(intent.x, intent.y) === intent.structureType;
      if (landed) resolve(entry, "confirmed");
    }

    for (const error of [...input.errors].sort((left, right) => left.receivedAt - right.receivedAt)) {
      const target = [...this.pending].reverse().find((entry) => entry.sentAtMs <= error.receivedAt);
      if (target) {
        resolve(target, "rejected", error);
        continue;
      }
      const late = this.upgradeLateRejection(error, input.turn);
      if (late) resolved.push(late);
    }

    for (const entry of [...this.pending]) {
      if (input.turn - entry.sentAtTurn >= EXPIRE_AFTER_TURNS) resolve(entry, "unconfirmed");
    }

    this.outcomes.push(...recorded);
    if (this.outcomes.length > MAX_OUTCOMES) this.outcomes.splice(0, this.outcomes.length - MAX_OUTCOMES);
    this.pruneCooldowns(input.turn);
    return resolved;
  }

  // A rejection with nothing pending may belong to an intent that already
  // expired as "unconfirmed" -- the server's reason is worth more than "no sign".
  private upgradeLateRejection(error: UnmatchedError, turn: number): Outcome | undefined {
    const candidate = [...this.outcomes].reverse().find((entry) => entry.outcome.status === "unconfirmed" && entry.sentAtMs <= error.receivedAt);
    if (!candidate) return undefined;
    candidate.outcome = { intent: candidate.outcome.intent, status: "rejected", turn, code: error.code, message: error.message };
    this.cooldownUntilTurn.set(cooldownKey(candidate.outcome.intent), turn + COOLDOWN_TURNS);
    return candidate.outcome;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  // True while a recent "unconfirmed" outcome could still be upgraded by a
  // late rejection.
  hasUpgradableOutcome(): boolean {
    return this.outcomes.some((entry) => entry.outcome.status === "unconfirmed");
  }

  // Blocked through turn `until` inclusive.
  private pruneCooldowns(turn: number): void {
    for (const [key, until] of this.cooldownUntilTurn) if (until < turn) this.cooldownUntilTurn.delete(key);
  }

  private cooldownActive(intent: Intent): boolean {
    const until = this.cooldownUntilTurn.get(cooldownKey(intent));
    return until !== undefined && until >= this.lastTurn;
  }

  blocksTech(techId: string): boolean {
    return this.isBlocked({ kind: "TECH", techId });
  }

  blocksStructure(x: number, y: number, structureType: EconomicStructureType): boolean {
    return this.isBlocked({ kind: "STRUCTURE", x, y, structureType });
  }

  private isBlocked(intent: Intent): boolean {
    return this.pending.some((entry) => pendingKey(entry.intent) === pendingKey(intent)) || this.cooldownActive(intent);
  }

  pendingLines(): string[] {
    return this.pending.map(
      (entry) => `PENDING ${describeIntent(entry.intent)} (sent turn ${entry.sentAtTurn}; not resolved yet -- don't resend)`
    );
  }

  // Lines for the model: still-pending intents first, then recent outcomes.
  summaryLines(turn: number): string[] {
    return [...this.pendingLines(), ...this.outcomes.map((entry) => describeOutcome(entry.outcome, turn))];
  }
}

export const describeOutcome = (outcome: Outcome, currentTurn: number): string => {
  const what = describeIntent(outcome.intent);
  const age = currentTurn - outcome.turn;
  const when = age <= 0 ? "this turn" : `${age} turn${age === 1 ? "" : "s"} ago`;
  if (outcome.status === "confirmed") return `${what}: confirmed (${when})`;
  if (outcome.status === "rejected") {
    return `${what}: probably REJECTED by the server -- ${outcome.code ?? "UNKNOWN"}${outcome.message ? `: ${outcome.message}` : ""} (${when})`;
  }
  return `${what}: no sign it took effect after ${EXPIRE_AFTER_TURNS} turns (${when})`;
};

// Reconciles against a full state snapshot. A structure only counts as landed
// when the tile is ours: a same-type structure that came with a captured tile
// says nothing about this command.
export const reconcileFromState = (
  ledger: IntentLedger,
  state: GameInitState,
  errors: readonly UnmatchedError[],
  turn: number
): Outcome[] => {
  const index = buildTileIndex(state);
  return ledger.reconcile({
    turn,
    techIds: state.techIds,
    structureTypeAt: (x, y) => {
      const tile = index.get(tileKey(x, y));
      return tile && tile.ownerId === state.playerId ? economicStructureType(tile) : undefined;
    },
    errors
  });
};

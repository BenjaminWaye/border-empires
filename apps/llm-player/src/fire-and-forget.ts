// Helpers shared by the session loop for the commands that carry no ack:
// turning an action into a ledger intent, the last-line guard that keeps an
// unoffered or withheld action from being sent, and the one-line "sent" log
// text. See intent-ledger.ts.
import { availableDomainChoices } from "./domains.js";
import type { FireAndForgetAction, GameInitState } from "./game-types.js";
import type { Intent, IntentLedger } from "./intent-ledger.js";
import { reachableTechChoices } from "./tech-tree.js";

export const isFireAndForgetAction = (action: { type: string }): action is FireAndForgetAction =>
  action.type === "BUILD_ECONOMIC_STRUCTURE" || action.type === "CHOOSE_TECH" || action.type === "CHOOSE_DOMAIN";

const assertNever = (value: never): never => {
  throw new Error(`Unhandled fire-and-forget action: ${JSON.stringify(value)}`);
};

export const intentFromAction = (action: FireAndForgetAction): Intent => {
  switch (action.type) {
    case "CHOOSE_TECH":
      return { kind: "TECH", techId: action.techId };
    case "CHOOSE_DOMAIN":
      return { kind: "DOMAIN", domainId: action.domainId };
    case "BUILD_ECONOMIC_STRUCTURE":
      return { kind: "STRUCTURE", x: action.x, y: action.y, structureType: action.structureType };
    default:
      return assertNever(action);
  }
};

const isBlockedByLedger = (action: FireAndForgetAction, intents: IntentLedger): boolean => {
  switch (action.type) {
    case "CHOOSE_TECH":
      return intents.blocksTech(action.techId);
    case "CHOOSE_DOMAIN":
      return intents.blocksDomain(action.domainId);
    case "BUILD_ECONOMIC_STRUCTURE":
      return intents.blocksStructure(action.x, action.y, action.structureType);
    default:
      return assertNever(action);
  }
};

// Why an action must not be sent, or undefined if it may go out. Last line of
// defence behind pre-filtering the prompt's options: the model can still name
// a stale or invented id, and a domain pick is permanent, so for tech and
// domain the id must be in the list the bot would offer right now. (Structure
// sites are cheap to re-derive per tile and a bad one is just a rejection.)
export const withholdReason = (action: FireAndForgetAction, state: GameInitState, intents: IntentLedger): string | undefined => {
  if (isBlockedByLedger(action, intents)) return "same target is pending or was just rejected (see recentOutcomes)";
  if (action.type === "CHOOSE_DOMAIN") {
    const offered = availableDomainChoices(state.domains, state.techIds, state.gold);
    if (!offered.some((choice) => choice.id === action.domainId)) return "that domain isn't in domainChoices right now";
  }
  if (action.type === "CHOOSE_TECH") {
    const offered = reachableTechChoices(state.techIds).filter((choice) => choice.goldCost <= state.gold);
    if (!offered.some((choice) => choice.id === action.techId)) return "that tech isn't in techChoices right now";
  }
  return undefined;
};

const describeAction = (action: FireAndForgetAction): string => {
  switch (action.type) {
    case "CHOOSE_TECH":
      return `CHOOSE_TECH(${action.techId})`;
    case "CHOOSE_DOMAIN":
      return `CHOOSE_DOMAIN(${action.domainId})`;
    case "BUILD_ECONOMIC_STRUCTURE":
      return `BUILD_ECONOMIC_STRUCTURE(${action.structureType}) (${action.x},${action.y})`;
    default:
      return assertNever(action);
  }
};

export const describeFireAndForgetResult = (
  action: FireAndForgetAction,
  result: { outcome: "accepted" } | { outcome: "error"; code: string; message: string } | undefined
): string =>
  result?.outcome === "error"
    ? `${describeAction(action)}: failed to send (${result.code})`
    : `${describeAction(action)}: sent (result tracked on later turns)`;

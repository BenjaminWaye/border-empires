// Space View's action cards (design doc §30). The galaxy view holds the decree
// hand; a system's view holds that system's orders. Once an action lands the
// view moves on by itself: to the next system with an order ready, then back
// to the galaxy. The cards are DOM over whichever map is showing, so they are
// the same on the 3D galaxy and the 2D strategic map.
import type { DukeActionOutcome, DukeApi } from "../client-duke-panel/client-duke-api.js";
import { errorMessage } from "../client-duke-panel/client-duke-format.js";
import type { DukeStatus } from "../client-duke-panel/client-duke-types.js";
import { spaceCardsHtml } from "./space-cards-html.js";
import { decreeCards, nextStop, orderCards, type CardAction, type SpaceCard, type SpaceStop } from "./space-cards-model.js";

export type SpaceCardsDeps = {
  api: DukeApi;
  // Re-fetches the Duke status; the new status comes back through setStatus.
  refresh: () => Promise<void>;
  // Flies the camera to a system, or back out to the galaxy.
  focusSystem: (seasonId: string) => void;
  showGalaxy: () => void;
  now?: () => number;
};

export type SpaceCards = {
  setStatus: (status: DukeStatus | undefined) => void;
  // The view the player moved to by themselves (pressing a planet, or zooming out).
  showSystem: (seasonId: string) => void;
  showGalaxy: () => void;
  stop: () => SpaceStop;
  dispose: () => void;
};

const run = (api: DukeApi, action: CardAction): Promise<DukeActionOutcome> => {
  switch (action.kind) {
    case "HOLD_COURT":
      return api.holdCourt();
    case "WAGER":
      return api.moveAgainstCourt(action.influence);
    case "DECLARE":
      return api.declareGrievance(action.targetSeasonId);
    case "LEND":
      return api.lendFleet(action.fromSeasonId);
    case "ANSWER_WRIT":
      return api.answerWrit(action.accept);
    case "ANSWER_OFFER":
      return api.answerOffer(action.accept);
    case "BUILD":
      return api.build(action.seasonId, action.body);
    case "LAUNCH":
      return api.order(action.seasonId, { kind: action.order, targetSeasonId: action.targetSeasonId });
  }
};

// Free answers (offers, Writs) leave the player where they are; a spent order
// or decree moves the view on.
const TICK_MS = 30_000;

const movesOn = (action: CardAction): boolean => action.kind !== "ANSWER_WRIT" && action.kind !== "ANSWER_OFFER";

export const mountSpaceCards = (screen: HTMLElement, deps: SpaceCardsDeps): SpaceCards => {
  const now = deps.now ?? (() => Date.now());
  const root = document.createElement("div");
  root.className = "sc-root";
  root.dataset.spaceCards = "";
  root.hidden = true;
  screen.appendChild(root);
  screen.classList.add("sv-cards-on");

  let status: DukeStatus | undefined;
  let stop: SpaceStop = { mode: "galaxy" };
  let hand: SpaceCard[] = [];
  let message = "";
  let busy = false;
  // Set while an action's refresh is in flight: move on once the new status lands.
  let advanceFrom: SpaceStop | null = null;

  const render = (): void => {
    if (!status) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const at = now();
    hand = stop.mode === "galaxy" ? decreeCards(status, at) : orderCards(status, stop.seasonId, at);
    root.innerHTML = spaceCardsHtml(status, stop, hand, at, message, confirmingCancel);
  };

  const go = (next: SpaceStop): void => {
    stop = next;
    message = "";
    confirmingCancel = false;
    if (next.mode === "system") deps.focusSystem(next.seasonId);
    else deps.showGalaxy();
    render();
  };

  const play = async (action: CardAction): Promise<void> => {
    if (busy) return;
    busy = true;
    const from = stop;
    try {
      const outcome = await run(deps.api, action);
      message = outcome.ok ? "" : (outcome.message ?? errorMessage(outcome, now(), status?.court.offer.moveLockedUntil));
      if (outcome.ok && movesOn(action)) advanceFrom = from;
      await deps.refresh();
    } finally {
      busy = false;
      // Only this action's refresh may move the view: if it failed, or the
      // status did not come back, stay put rather than jump on a later poll.
      advanceFrom = null;
    }
    render();
  };

  // Cancelling keeps the day's order spent, so it takes a second press.
  let confirmingCancel = false;
  const cancel = async (seasonId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const outcome = await deps.api.cancelBuild(seasonId);
      message = outcome.ok ? "" : (outcome.message ?? errorMessage(outcome, now()));
      await deps.refresh();
    } finally {
      busy = false;
      confirmingCancel = false;
    }
    render();
  };

  // Timers ("next order in 3h", build countdowns) tick between status polls,
  // and a card comes alive when its order is ready again.
  const ticker = setInterval(() => {
    if (!busy) render();
  }, TICK_MS);

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    // While an action is in flight the view is about to move on by itself.
    if (busy) return;
    const d = button.dataset;
    if (button.hasAttribute("data-sc-galaxy")) return go({ mode: "galaxy" });
    if (d.scSystem) return go({ mode: "system", seasonId: d.scSystem });
    if (button.hasAttribute("data-sc-cancel") && stop.mode === "system") {
      if (!confirmingCancel) {
        confirmingCancel = true;
        return render();
      }
      void cancel(stop.seasonId);
      return;
    }
    const id = d.scPlay ?? d.scAlt;
    const card = hand.find((c) => c.id === id);
    if (!card) return;
    const action = d.scAlt !== undefined && card.alt ? card.alt.action : card.action;
    void play(action);
  });

  return {
    setStatus: (next) => {
      status = next;
      if (stop.mode === "system" && next && !next.systems.some((s) => s.seasonId === (stop as { seasonId: string }).seasonId)) stop = { mode: "galaxy" };
      if (advanceFrom && next) {
        const from = advanceFrom;
        advanceFrom = null;
        return go(nextStop(next, from));
      }
      render();
    },
    showSystem: (seasonId) => {
      if (stop.mode === "system" && stop.seasonId === seasonId) return;
      stop = { mode: "system", seasonId };
      message = "";
      render();
    },
    showGalaxy: () => {
      if (stop.mode === "galaxy") return;
      stop = { mode: "galaxy" };
      message = "";
      render();
    },
    stop: () => stop,
    dispose: () => {
      clearInterval(ticker);
      root.remove();
      screen.classList.remove("sv-cards-on");
    }
  };
};

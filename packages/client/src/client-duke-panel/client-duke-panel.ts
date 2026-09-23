// DOM/network wiring for the Duke HUD and panel (design doc §24.4, §26): the
// one-choice banner and three meters stay on screen; the panel holds every
// action. Split from client-duke-html.ts (pure HTML) like the other panels.
import { createDukeApi, type DukeApi, type DukeActionOutcome } from "./client-duke-api.js";
import { errorMessage } from "./client-duke-format.js";
import { dukeHudHtml, dukePanelHtml } from "./client-duke-html.js";
import type { DukeStatus, DukeTargetOption } from "./client-duke-types.js";

export type DukeControllerDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  // Every publicly-held system except the caller's own (same list the Senate
  // panel uses), so Probes and raids can name a target.
  getTargetOptions: () => DukeTargetOption[];
  // Opens the panel (the caller owns tab exclusivity between panels).
  openPanel: () => void;
  now?: () => number;
  // Injected for tests; defaults to the real API.
  api?: DukeApi;
  refreshIntervalMs?: number;
};

export type DukeController = {
  refresh: () => Promise<void>;
  isDuke: () => boolean;
  dispose: () => void;
};

export const mountDukeController = (screen: HTMLElement, panel: HTMLElement, deps: DukeControllerDeps): DukeController => {
  const now = deps.now ?? (() => Date.now());
  const api = deps.api ?? createDukeApi({ wsUrl: deps.wsUrl, getIdToken: deps.getIdToken });
  const hud = document.createElement("div");
  hud.className = "dk-hud";
  hud.dataset.dukeHud = "";
  hud.hidden = true;
  screen.appendChild(hud);

  let status: DukeStatus | undefined;
  let pendingMessage = "";

  const showMessage = (text: string): void => {
    pendingMessage = text;
    const el = panel.querySelector<HTMLElement>("[data-duke-message]");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };

  const render = (): void => {
    if (!status) {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    hud.innerHTML = dukeHudHtml(status, now());
    // Don't rebuild the panel under the player's cursor while they type.
    if (panel.contains(document.activeElement) && document.activeElement !== panel) return;
    panel.innerHTML = dukePanelHtml(status, now(), deps.getTargetOptions());
    showMessage(pendingMessage);
  };

  const refresh = async (): Promise<void> => {
    const result = await api.fetchStatus();
    if (result.status) status = result.status;
    else if (result.notADuke) status = undefined;
    render();
  };

  const report = async (outcome: DukeActionOutcome): Promise<void> => {
    if (outcome.ok) {
      pendingMessage = "";
      await refresh();
      return;
    }
    const message = outcome.message ?? errorMessage(outcome, now(), status?.court.offer.moveLockedUntil);
    await refresh();
    showMessage(message);
  };

  const value = (selector: string): string => panel.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";

  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    if (button.dataset.dukeOfferAnswer) return void api.answerOffer(button.dataset.dukeOfferAnswer === "accept").then(report);
    if (button.dataset.dukeInvest === "FIGHTER" || button.dataset.dukeInvest === "PROBE" || button.dataset.dukeInvest === "REFIT") {
      return void api.invest({ kind: button.dataset.dukeInvest }).then(report);
    }
    if (button.hasAttribute("data-duke-fortify")) {
      const seasonId = value("[data-duke-fortify-sector]");
      const points = Number(value("[data-duke-fortify-points]"));
      return void api.invest({ kind: "FORTIFY", seasonId, points }).then(report);
    }
    if (button.hasAttribute("data-duke-cancel-build")) return void api.cancelBuild().then(report);
    if (button.hasAttribute("data-duke-court-move")) return void api.moveAgainstCourt(Number(value("[data-duke-court-wager]"))).then(report);
    if (button.dataset.dukeOrderLaunch === "PROBE") {
      return void api.order({ kind: "PROBE", seasonId: value("[data-duke-probe-target]") }).then(report);
    }
    if (button.dataset.dukeOrderLaunch === "RAID") {
      return void api.order({ kind: "RAID", seasonId: value("[data-duke-raid-target]") }).then(report);
    }
  });

  screen.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-duke-open]")) deps.openPanel();
  });

  const timer = setInterval(() => void refresh(), deps.refreshIntervalMs ?? 30_000);
  return {
    refresh,
    isDuke: () => status !== undefined,
    dispose: () => {
      clearInterval(timer);
      hud.remove();
    }
  };
};

// DOM/network wiring for the Duke HUD and panel (design doc §24.4, §26). The
// HUD stays on screen and says what needs you; the panel holds the planet, the
// Court and the log. Split from the *-html.ts modules (pure HTML) like the
// other Space View panels.
import { createDukeApi, type DukeActionOutcome, type DukeApi } from "./client-duke-api.js";
import { errorMessage } from "./client-duke-format.js";
import { dukeHudHtml } from "./client-duke-hud-html.js";
import { dukePanelHtml } from "./client-duke-panel-html.js";
import type { DukePanelTab, DukeShipKind, DukeStatus, DukeTargetInfo, DukeTargetOption } from "./client-duke-types.js";

export type DukeControllerDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  // Every publicly-held system except the caller's own, so Probes and raids can
  // name a target.
  getTargetOptions: () => DukeTargetOption[];
  // Opens the panel (the caller owns tab exclusivity between panels).
  openPanel: () => void;
  now?: () => number;
  // Called after every refresh with the latest status (undefined when the
  // account is not a Duke), so other Space View parts can react to it.
  onStatus?: (status: DukeStatus | undefined) => void;
  // Injected for tests; defaults to the real API.
  api?: DukeApi;
  refreshIntervalMs?: number;
};

export type DukeController = {
  refresh: () => Promise<void>;
  isDuke: () => boolean;
  // Opens the planet tab on one system (pressing a planet on the map).
  showSystem: (seasonId: string) => void;
  showTab: (tab: DukePanelTab) => void;
  // Opens what is known about a system that is not yours.
  showTarget: (target: DukeTargetInfo) => void;
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
  let tab: DukePanelTab = "SYSTEM";
  let selectedSeasonId: string | null = null;
  let selectedShip: DukeShipKind | null = null;
  let target: DukeTargetInfo | null = null;
  let pendingMessage = "";

  const currentSeasonId = (): string | null => {
    if (!status) return null;
    return status.systems.find((s) => s.seasonId === selectedSeasonId)?.seasonId ?? status.systems[0]?.seasonId ?? null;
  };

  const showMessage = (text: string): void => {
    pendingMessage = text;
    const el = panel.querySelector<HTMLElement>("[data-duke-message]");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };

  const renderPanel = (force: boolean): void => {
    if (!status) return;
    // Don't rebuild the panel under the player's cursor while they type or drag.
    if (!force && panel.contains(document.activeElement) && document.activeElement !== panel) return;
    panel.innerHTML = dukePanelHtml(status, { now: now(), tab, seasonId: currentSeasonId(), targets: deps.getTargetOptions(), selectedShip, target });
    showMessage(pendingMessage);
  };

  const render = (forcePanel = false): void => {
    deps.onStatus?.(status);
    if (!status) {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    hud.innerHTML = dukeHudHtml(status, now());
    renderPanel(forcePanel);
  };

  const refresh = async (): Promise<void> => {
    const result = await api.fetchStatus();
    if (result.status) status = result.status;
    else if (result.notADuke) status = undefined;
    render();
  };

  const report = async (outcome: DukeActionOutcome): Promise<void> => {
    const message = outcome.ok ? "" : (outcome.message ?? errorMessage(outcome, now(), status?.court.offer.moveLockedUntil));
    if (outcome.ok) pendingMessage = "";
    await refresh();
    render(true);
    if (!outcome.ok) showMessage(message);
  };

  const value = (selector: string): string => panel.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";
  const seasonId = (): string => currentSeasonId() ?? "";

  panel.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const d = button.dataset;
    if (d.dukeSelectSystem) {
      selectedSeasonId = d.dukeSelectSystem;
      selectedShip = null;
      return render(true);
    }
    if (d.dukeShip) {
      selectedShip = selectedShip === d.dukeShip ? null : (d.dukeShip as DukeShipKind);
      return render(true);
    }
    if (d.dukeOfferAnswer) return void api.answerOffer(d.dukeOfferAnswer === "accept").then(report);
    if (d.dukeBuild === "FIGHTER" || d.dukeBuild === "PROBE" || d.dukeBuild === "REFIT") return void api.build(seasonId(), { kind: d.dukeBuild }).then(report);
    if (d.dukeDevelop !== undefined) return void api.build(seasonId(), { kind: "DEVELOP", bodyIndex: Number(d.dukeDevelop) }).then(report);
    if (button.hasAttribute("data-duke-fortify")) return void api.build(seasonId(), { kind: "FORTIFY", points: Number(value("[data-duke-fortify-points]")) }).then(report);
    if (button.hasAttribute("data-duke-cancel-build")) return void api.cancelBuild(seasonId()).then(report);
    if (button.hasAttribute("data-duke-court-move")) return void api.moveAgainstCourt(Number(value("[data-duke-court-wager]"))).then(report);
    if (d.dukeOrderLaunch === "PROBE" || d.dukeOrderLaunch === "RAID") {
      const target = value(d.dukeOrderLaunch === "PROBE" ? "[data-duke-probe-target]" : "[data-duke-raid-target]");
      selectedShip = null;
      return void api.order(seasonId(), { kind: d.dukeOrderLaunch, targetSeasonId: target }).then(report);
    }
  });

  panel.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-duke-fortify-points]")) {
      const output = panel.querySelector<HTMLElement>("[data-duke-fortify-output]");
      if (output) output.textContent = `+${target.value}`;
    }
  });

  const showSystem = (id: string): void => {
    tab = "SYSTEM";
    selectedSeasonId = id;
    selectedShip = null;
    render(true);
    deps.openPanel();
  };
  const showTarget = (info: DukeTargetInfo): void => {
    target = info;
    tab = "TARGET";
    pendingMessage = "";
    render(true);
    deps.openPanel();
  };
  const showTab = (next: DukePanelTab): void => {
    tab = next;
    pendingMessage = "";
    render(true);
    deps.openPanel();
  };

  screen.addEventListener("click", (event) => {
    const attention = (event.target as HTMLElement).closest<HTMLElement>("[data-duke-attention]");
    if (!attention) return;
    const kind = attention.dataset.dukeAttention;
    if (kind === "COURT_OFFER" || kind === "PETITION_READY") return showTab("COURT");
    if (attention.dataset.seasonId) return showSystem(attention.dataset.seasonId);
    showTab("SYSTEM");
  });

  const timer = setInterval(() => void refresh(), deps.refreshIntervalMs ?? 30_000);
  return {
    refresh,
    isDuke: () => status !== undefined,
    showSystem,
    showTab,
    showTarget,
    dispose: () => {
      clearInterval(timer);
      hud.remove();
    }
  };
};

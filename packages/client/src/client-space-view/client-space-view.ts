// Space View: the galactic meta-layer's first real screen. Mounted *inside*
// #hud (same as the galaxy overlay — see the stacking-order comment atop
// client-galaxy-view.ts) so its z-index compares correctly against #hud's
// other children, in particular the galaxy overlay (once opened from a
// "Manage Planet" button here, since removed): a sibling of #hud with any explicit z-index would
// always paint above #hud's entire subtree regardless of the number used,
// which used to bury that overlay behind the Space View screen. Toggled via
// `state.activeScreen`. Gated entirely on owning at least one durable galaxy
// Planet: a player with zero planets gets no launcher button, no fetch, no
// DOM — the existing season flow is untouched for them.
import { onAuthStateChanged, type Auth } from "firebase/auth";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { settingsPanelHtml } from "../client-hud/client-hud-settings-panel.js";
import type { ClientState } from "../client-state/client-state.js";
import { spaceViewChromeHtml, spaceViewLauncherHtml, spaceViewStatsHtml, spaceViewStyle } from "./client-space-view-html.js";
import { spaceViewIntroHtml, spaceViewIntroStyle, SPACE_VIEW_INTRO_TIP_ID } from "./client-space-view-intro.js";
import { mountSpaceViewWelcomeLetter, spaceViewWelcomeStyle } from "./client-space-view-welcome-letter.js";
import { ownsSpaceViewEligiblePlanet, toSpacePlanetViewModels, type PublicGalaxyPlanet } from "./client-space-view-state.js";
import { isDiscoveryTipSeen, markDiscoveryTipSeen } from "../client-discovery-tips/client-discovery-tips-storage.js";
import { createSpaceScene, type SpaceScene } from "./client-space-map-3d/client-space-map-3d.js";
import { mountPanelDismissal } from "./client-space-view-panels.js";
import { createStrategicMapController, type StrategicMapController } from "./client-strategic-map/client-strategic-map-controller.js";
import { mountSenatePanel } from "../client-senate-panel/client-senate-panel.js";
import { senateStyle, type SenateTargetOption } from "../client-senate-panel/client-senate-panel-html.js";
import { mountDukeController, type DukeController } from "../client-duke-panel/client-duke-panel.js";
import { dukeStyle } from "../client-duke-panel/client-duke-style.js";
import type { FleetHullClassId } from "../client-fleet-panel/client-fleet-panel-html.js";

type GalaxyMeMinimal = {
  planets?: Array<{ seasonId: string; planetName?: string | null; named?: boolean }>;
  outposts?: Array<{ seasonId: string }>;
  // Only present once the gateway's galaxyEconomyStore is wired (galactic
  // v1) -- absent means "no economy yet", not "zero income", so this stays
  // optional and Space View shows 0/0 rather than implying a real balance.
  economy?: { influence: number; production: number };
};
type GalaxyPublicListing = { planets?: PublicGalaxyPlanet[]; outposts?: PublicGalaxyPlanet[] };
type RawFleetOrderForOverlay = {
  id: string;
  ownerAuthUid: string;
  originSeasonId?: string;
  targetSeasonId: string;
  composition: Partial<Record<FleetHullClassId, number>>;
  sentAt: number;
  departsAt?: number;
  arrivesAt: number;
  status: "TRAVELING" | "RESOLVED";
};

export type SpaceViewDeps = {
  state: ClientState;
  firebaseAuth: Auth | undefined;
  wsUrl: string;
  // Real, typed seam for re-entering a Sector campaign from a clicked
  // planet. Wiring this to the actual season-switch machinery is out of
  // scope for this first pass — see the PR description's deferred list.
  onEnterSeason?: (seasonId: string) => void;
};

export const mountSpaceView = (deps: SpaceViewDeps): void => {
  const hud = document.getElementById("hud");
  if (!hud?.parentElement) return;

  let launcher: HTMLButtonElement | undefined;
  let screen: HTMLDivElement | undefined;
  let scene: SpaceScene | undefined;
  let strategicMap: StrategicMapController | undefined;
  let styleEl: HTMLStyleElement | undefined;

  const ensureStyle = (): void => {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.textContent = spaceViewStyle + spaceViewIntroStyle + spaceViewWelcomeStyle + senateStyle + dukeStyle;
    document.head.appendChild(styleEl);
  };

  // Every publicly-held territory except this account's own -- the Senate
  // can only be raised against someone else's holding. Refreshed on every
  // load() cycle alongside the 3D scene's own planet models.
  let senateTargetOptions: SenateTargetOption[] = [];
  let senatePanel: { refresh: () => Promise<void> } | undefined;
  let duke: DukeController | undefined;
  // Systems this account holds, so pressing one opens its panel.
  let ownedSeasonIds: ReadonlySet<string> = new Set();

  // Drives the 3D scene's in-flight ship overlay (client-space-fleet-overlay.ts).
  // Only the caller's own orders are shown as actual ships -- composition
  // and origin are still just for you. Refreshed on every load() cycle and
  // periodically while mounted, since a fleet can be sent from the still-open
  // panel without a full page reload.
  const refreshFleetOverlay = async (): Promise<void> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user || !scene) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => undefined)) as { orders?: RawFleetOrderForOverlay[] } | undefined;
      const traveling = (body?.orders ?? []).filter((o) => o.status === "TRAVELING");
      scene.setFleetOrders(traveling);
    } catch {
      // Network hiccup: the overlay just keeps showing its last-known state.
    }
  };

  // Enemy fleets aren't shown as actual ships (composition/origin stay
  // hidden -- see GET /hq/galaxy/fleets/incoming's comment on the gateway)
  // but a territory with a RAID inbound gets a pulsing red threat ring in
  // its solar system, so "someone is coming" is at least visible. Kept as
  // its own fetch/state rather than folded into `load()`'s listing so the
  // 20s periodic refresh can update it without re-fetching the whole galaxy.
  let threatenedSeasonIds = new Set<string>();
  const refreshThreats = async (): Promise<void> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user || !scene) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/incoming`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => undefined)) as { threats?: Array<{ targetSeasonId: string }> } | undefined;
      threatenedSeasonIds = new Set((body?.threats ?? []).map((t) => t.targetSeasonId));
      scene.setThreats(threatenedSeasonIds);
    } catch {
      // Network hiccup: threat rings just keep showing their last-known state.
    }
  };

  const renderSettingsPanel = (): void => {
    const panel = screen?.querySelector<HTMLDivElement>("[data-space-view-settings-panel]");
    if (!panel) return;
    panel.innerHTML = settingsPanelHtml(deps.state, deps.wsUrl, deps.firebaseAuth);
  };

  // The launcher is one button doing double duty: "open Space View" from the
  // season HUD, "return to season" once inside it. Updated on every
  // visibility change rather than having a separate Return button in the
  // chrome (which used to duplicate this).
  const updateLauncherForScreen = (inSpaceView: boolean): void => {
    if (!launcher) return;
    launcher.textContent = inSpaceView ? "🌍" : "🌌";
    const label = inSpaceView ? "Return to Season" : "Open Space View";
    launcher.title = label;
    launcher.setAttribute("aria-label", label);
  };

  const setScreenVisible = (visible: boolean): void => {
    if (!screen) return;
    screen.hidden = !visible;
    // #hud is `position:fixed` chrome for the season HUD; Space View is a
    // full alternate screen rather than another layer inside it, so it's
    // hidden (not removed — it keeps its state) while Space View is shown,
    // and restored on return. Per the task's guidance to add "the simplest"
    // screen-swap pattern given none already existed for full-screen swaps.
    hud.style.visibility = visible ? "hidden" : "";
    hud.style.pointerEvents = visible ? "none" : "";
    updateLauncherForScreen(visible);
    if (visible) scene?.resize();
  };

  const ensureMounted = (welcomePlanet?: { seasonId: string; planetName: string | null; named: boolean }): void => {
    if (screen) return;
    ensureStyle();

    const launcherWrapper = document.createElement("div");
    launcherWrapper.innerHTML = spaceViewLauncherHtml();
    launcher = launcherWrapper.firstElementChild as HTMLButtonElement;
    hud.appendChild(launcher);
    launcher.addEventListener("click", () => {
      const enteringSpaceView = deps.state.activeScreen !== "space";
      deps.state.activeScreen = enteringSpaceView ? "space" : "season";
      setScreenVisible(enteringSpaceView);
    });

    screen = document.createElement("div");
    screen.className = "sv-screen";
    screen.hidden = true;
    screen.innerHTML = spaceViewChromeHtml(spaceViewStatsHtml(0, 0));
    hud.appendChild(screen);

    // First-visit briefing: shown once (server-synced dismissal, same as
    // every other discovery tip -- see client-space-view-intro.ts's header
    // comment). Only the account's own email keys the "seen" state, same
    // scoping every other hint uses, so a shared browser/device doesn't
    // cross-suppress it between accounts.
    const authEmail = deps.firebaseAuth?.currentUser?.email;
    if (!isDiscoveryTipSeen(SPACE_VIEW_INTRO_TIP_ID, authEmail)) {
      const introWrapper = document.createElement("div");
      introWrapper.innerHTML = spaceViewIntroHtml();
      const introEl = introWrapper.firstElementChild as HTMLElement;
      screen.appendChild(introEl);
      introEl.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-space-view-intro-dismiss]") || target === introEl) {
          markDiscoveryTipSeen(SPACE_VIEW_INTRO_TIP_ID, authEmail);
          introEl.remove();
        }
      });
    }

    // First-visit welcome: name your planet, then a decree letter from the
    // Imperial Court. Mounted after the briefing (higher z-index — see
    // client-space-view-welcome-letter.ts) so it's the first thing a new
    // Duke actually sees; the briefing is still there underneath once
    // dismissed. Only fires when this load() cycle resolved an owned
    // planet -- guaranteed by the spaceViewEligible check in load() below.
    if (welcomePlanet) {
      mountSpaceViewWelcomeLetter({
        screen,
        seasonId: welcomePlanet.seasonId,
        planetName: welcomePlanet.planetName,
        named: welcomePlanet.named,
        authEmail,
        wsUrl: deps.wsUrl,
        getIdToken: async () => deps.firebaseAuth?.currentUser?.getIdToken()
      });
    }

    const canvas = screen.querySelector<HTMLCanvasElement>("[data-space-view-canvas]")!;
    scene = createSpaceScene({
      container: screen,
      canvas,
      onEnterSeason: (seasonId: string) => deps.onEnterSeason?.(seasonId),
      // Pressing one of your own planets opens its panel (design doc §24.4).
      onSelectSystem: (seasonId: string) => {
        if (ownedSeasonIds.has(seasonId)) duke?.showSystem(seasonId);
      }
    });

    // §22: zooming out past the wide view (or the chrome button) reveals the
    // flat strategic map; picking a system there flies the 3D camera in on it.
    let systemFocused = false;
    const relabelMapButton = (): void => {
      const button = screen?.querySelector<HTMLButtonElement>("[data-space-view-strategic-map]");
      if (button) button.textContent = strategicMap?.isVisible() || systemFocused ? "🌌 Galaxy View" : "🗺 Strategic Map";
    };
    strategicMap = createStrategicMapController({
      screen,
      onSelectSystem: (seasonId) => {
        scene?.focusSystem(seasonId);
        if (ownedSeasonIds.has(seasonId)) duke?.showSystem(seasonId);
      },
      onClose: () => scene?.resetView(),
      // One button toggles the map: it offers the way back out to the 3D galaxy while the map is up.
      onVisibleChange: () => relabelMapButton()
    });
    scene.onFocusChange((focused) => {
      systemFocused = focused;
      relabelMapButton();
    });
    scene.onZoomedOut(() => strategicMap?.show());

    // Every panel closes with its close button, a press outside it, or Escape.
    mountPanelDismissal(screen);

    // The one-choice banner and three meters stay on screen; every Duke action
    // lives in the Duke panel (design doc §24.4, §26).
    const dukePanel = screen.querySelector<HTMLDivElement>("[data-space-view-duke-panel]")!;
    duke = mountDukeController(screen, dukePanel, {
      wsUrl: deps.wsUrl,
      getIdToken: async () => deps.firebaseAuth?.currentUser?.getIdToken(),
      getTargetOptions: () => senateTargetOptions,
      openPanel: () => openDukePanel(),
      onStatus: (status) => {
        strategicMap?.setOrbiting(new Set(status?.orbiting.map((o) => o.seasonId) ?? []));
        showDukeStats(status);
        // A red dot on the Court button when the Court offer or a Petition is waiting.
        const courtButton = screen?.querySelector<HTMLButtonElement>("[data-space-view-court]");
        if (courtButton) courtButton.toggleAttribute("data-alert", !!status && (status.court.offer.status === "PENDING" || status.attention.some((a) => a.kind === "PETITION_READY")));
      }
    });

    // The three top-right tabs (Senate/Duke/Settings) are meant to be
    // mutually exclusive -- only one panel visible at a time. Each toggle
    // below used to just flip its own panel's `hidden`, with no awareness
    // of the other two, so opening a second tab stacked its panel on top
    // of whichever one was already open instead of replacing it.
    const closeOtherPanels = (openSelector: string): void => {
      for (const selector of ["[data-space-view-settings-panel]", "[data-space-view-senate-panel]", "[data-space-view-duke-panel]"]) {
        if (selector === openSelector) continue;
        const panel = screen!.querySelector<HTMLDivElement>(selector);
        if (panel) panel.hidden = true;
      }
    };

    const openDukePanel = (): void => {
      const selector = "[data-space-view-duke-panel]";
      closeOtherPanels(selector);
      screen!.querySelector<HTMLDivElement>(selector)!.hidden = false;
      void duke?.refresh();
    };

    screen.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-space-view-strategic-map]")) {
        if (strategicMap?.isVisible()) {
          strategicMap.hide();
          scene?.resetView();
        } else if (systemFocused) {
          scene?.resetView();
        } else {
          strategicMap?.show();
        }
        return;
      }
      if (target.closest("[data-space-view-court]")) {
        duke?.showTab("COURT");
        return;
      }
      if (target.closest("[data-space-view-log]")) {
        duke?.showTab("LOG");
        return;
      }
      if (target.closest("[data-space-view-settings]")) {
        const selector = "[data-space-view-settings-panel]";
        const panel = screen!.querySelector<HTMLDivElement>(selector)!;
        const opening = panel.hidden;
        closeOtherPanels(selector);
        panel.hidden = !opening;
        if (opening) renderSettingsPanel();
        return;
      }
      if (target.closest("[data-space-view-senate]")) {
        const selector = "[data-space-view-senate-panel]";
        const panel = screen!.querySelector<HTMLDivElement>(selector)!;
        const opening = panel.hidden;
        closeOtherPanels(selector);
        panel.hidden = !opening;
        if (opening) {
          if (!senatePanel) {
            senatePanel = mountSenatePanel(panel, {
              wsUrl: deps.wsUrl,
              getIdToken: async () => deps.firebaseAuth?.currentUser?.getIdToken(),
              getTargetOptions: () => senateTargetOptions
            });
          } else {
            void senatePanel.refresh();
          }
        }
        return;
      }
      // Minimal settings navigation: hub -> subpage -> back. Deeper actions
      // rendered inside settingsPanelHtml (sign out, audio toggle, map
      // reveal, etc.) reuse the same data-attributes client-hud.ts binds —
      // they are not independently re-wired here; see the PR description
      // for this explicitly-scoped gap.
      const backBtn = target.closest("[data-settings-back]");
      if (backBtn) {
        deps.state.settingsSubPage = null;
        renderSettingsPanel();
        return;
      }
      const navItem = target.closest<HTMLElement>("[data-settings-nav]");
      if (navItem?.dataset.settingsNav) {
        deps.state.settingsSubPage = navItem.dataset.settingsNav as ClientState["settingsSubPage"];
        renderSettingsPanel();
      }
    });

    window.addEventListener("resize", () => {
      if (!screen?.hidden) {
        scene?.resize();
        strategicMap?.resize();
      }
    });

    // A fleet's real arrival is server-driven, so this just needs to catch
    // "a new fleet was sent" or "an old one resolved" reasonably promptly --
    // not drive the flight animation itself, which runs every frame off
    // real wall-clock time regardless of when this last fired. Same for
    // threats -- "a raid just started/landed."
    setInterval(() => {
      void refreshFleetOverlay();
      void refreshThreats();
    }, 20_000);
  };

  // §17.2 fog of war: seasonIds this account has Surveyed (via a Scout
  // mission -- see galaxy-fleet-scheduler.ts). A system not in this set
  // renders as "unknown" instead of leaking its owner/name. Refreshed on
  // every load() cycle alongside everything else. `undefined` (rather than
  // an empty set) means the exploration endpoint isn't available/wired --
  // degrades to "no fog" (everything visible, today's pre-§17 behavior)
  // instead of misreading unavailability as "nothing charted".
  let chartedSeasonIds: Set<string> | undefined;

  const applyGalaxyListing = (listing: GalaxyPublicListing, mySeasonIds: ReadonlySet<string>): void => {
    const planets = [...(listing.planets ?? []), ...(listing.outposts ?? [])];
    const isCharted = chartedSeasonIds ? (seasonId: string) => chartedSeasonIds!.has(seasonId) : undefined;
    const isUnderThreat = (seasonId: string) => threatenedSeasonIds.has(seasonId);
    const models = toSpacePlanetViewModels(planets, mySeasonIds, undefined, isCharted, isUnderThreat);
    ownedSeasonIds = mySeasonIds;
    scene?.setPlanets(models);
    strategicMap?.setPlanets(models);
    senateTargetOptions = planets
      .filter((p) => !mySeasonIds.has(p.seasonId))
      .map((p) => ({ seasonId: p.seasonId, label: p.planetName ?? p.seasonId }));
  };

  // Re-renders regardless of ensureMounted's once-only guard, so a later
  // auth/load cycle (economy balance changed) still refreshes the numbers
  // shown, not just the first one that mounted the screen.
  // A Duke's Production is a daily rate per planet now, not the weekly balance
  // /hq/galaxy/me reports (always 0), so once their Duke status is known it wins.
  let dukeStatsShown = false;
  const updateStats = (economy: { influence: number; production: number } | undefined): void => {
    const container = screen?.querySelector<HTMLDivElement>("[data-space-view-stats]");
    if (!container || dukeStatsShown) return;
    container.innerHTML = spaceViewStatsHtml(economy?.influence ?? 0, economy?.production ?? 0);
  };
  const showDukeStats = (status: { influence: number; systems: ReadonlyArray<{ ratePerDay: number }> } | undefined): void => {
    const container = screen?.querySelector<HTMLDivElement>("[data-space-view-stats]");
    if (!container || !status) return;
    dukeStatsShown = true;
    const perDay = Math.round(status.systems.reduce((sum, s) => sum + s.ratePerDay, 0) * 10) / 10;
    container.innerHTML = spaceViewStatsHtml(status.influence, `${perDay}/day`);
  };

  const load = async (): Promise<void> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const meResponse = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!meResponse.ok) return;
      const meBody = (await meResponse.json().catch(() => undefined)) as GalaxyMeMinimal | undefined;
      const myPlanets = meBody?.planets ?? [];
      const myOutposts = meBody?.outposts ?? [];
      deps.state.spaceViewEligible = ownsSpaceViewEligiblePlanet(myPlanets);
      if (!deps.state.spaceViewEligible) return;

      const firstPlanet = myPlanets[0];
      ensureMounted(
        firstPlanet
          ? { seasonId: firstPlanet.seasonId, planetName: firstPlanet.planetName ?? null, named: firstPlanet.named ?? false }
          : undefined
      );
      updateStats(meBody?.economy);
      void duke?.refresh();

      const explorationResponse = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/exploration`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (explorationResponse.ok) {
        const explorationBody = (await explorationResponse.json().catch(() => undefined)) as { systems?: Array<{ seasonId: string }> } | undefined;
        chartedSeasonIds = new Set((explorationBody?.systems ?? []).map((s) => s.seasonId));
      }

      const listingResponse = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy`, { headers: { Accept: "application/json" } });
      if (!listingResponse.ok) return;
      const listing = (await listingResponse.json().catch(() => undefined)) as GalaxyPublicListing | undefined;
      if (!listing) return;
      // Space View's own-world highlight should cover everything this
      // account holds, not just Planets -- an owned Outpost showing up as
      // "other" (unowned) in the scene would be a real correctness gap,
      // not just cosmetic, since the whole point of the state coloring is
      // "what do I hold."
      const mySeasonIds = new Set([...myPlanets, ...myOutposts].map((holding) => holding.seasonId));
      await refreshThreats();
      applyGalaxyListing(listing, mySeasonIds);
      await refreshFleetOverlay();
    } catch {
      // Network hiccup: Space View just stays unmounted until the next auth event.
    }
  };

  if (deps.firebaseAuth) {
    onAuthStateChanged(deps.firebaseAuth, () => void load());
  }
  void load();
};

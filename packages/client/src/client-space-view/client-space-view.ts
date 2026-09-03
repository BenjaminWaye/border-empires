// Space View: the galactic meta-layer's first real screen. Mounted as a
// sibling of #hud (not nested inside its overlay/z-index stack — see the
// stacking-order comment atop client-galaxy-view.ts for why #hud's own
// z-index scale can't safely be reused here) and toggled via
// `state.activeScreen`. Gated entirely on owning at least one durable galaxy
// Planet: a player with zero planets gets no launcher button, no fetch, no
// DOM — the existing season flow is untouched for them.
import { onAuthStateChanged, type Auth } from "firebase/auth";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { strategicRibbonHtml } from "../client-panel-html/client-panel-html.js";
import { settingsPanelHtml } from "../client-hud/client-hud-settings-panel.js";
import type { ClientState } from "../client-state/client-state.js";
import { spaceViewChromeHtml, spaceViewLauncherHtml, spaceViewStyle } from "./client-space-view-html.js";
import { ownsSpaceViewEligiblePlanet, toSpacePlanetViewModels, type PublicGalaxyPlanet } from "./client-space-view-state.js";
import { createSpaceScene, type SpaceScene } from "./client-space-map-3d/client-space-map-3d.js";

type GalaxyMeMinimal = { planets?: Array<{ seasonId: string }>; outposts?: Array<{ seasonId: string }> };
type GalaxyPublicListing = { planets?: PublicGalaxyPlanet[]; outposts?: PublicGalaxyPlanet[] };

export type SpaceViewDeps = {
  state: ClientState;
  firebaseAuth: Auth | undefined;
  wsUrl: string;
  // Real, typed seam for re-entering a Sector campaign from a clicked
  // planet. Wiring this to the actual season-switch machinery is out of
  // scope for this first pass — see the PR description's deferred list.
  onEnterSeason?: (seasonId: string) => void;
  // Opens the pre-existing galaxy overlay (planet christening, Emperor
  // endorsement) — see client-galaxy-view.ts's GalaxyViewHandle. Space View
  // is the single entry-point button for Planet owners, so this is how they
  // still reach those actions instead of a second floating launcher.
  openGalaxyManage?: () => void;
};

const zeroedResourceRecord = <T extends string>(keys: readonly T[]): Record<T, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

/**
 * Space View has no galactic economy yet (Influence/Production trickle is
 * unbuilt — design doc §4/§5). The ribbon is still reused per spec, so it
 * renders with the player's zeroed strategic-resource shape rather than
 * their live season numbers, which would misleadingly imply this ribbon
 * reflects galactic income.
 */
const ZERO_RESOURCES = zeroedResourceRecord(["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const);
const ZERO_UPKEEP = { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 };
const ZERO_ANIM = Object.fromEntries(
  (["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const).map((key) => [key, { until: 0, dir: 0 as const }])
) as Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", { until: 0; dir: 0 }>;

export const mountSpaceView = (deps: SpaceViewDeps): void => {
  const hud = document.getElementById("hud");
  if (!hud?.parentElement) return;

  let launcher: HTMLButtonElement | undefined;
  let screen: HTMLDivElement | undefined;
  let scene: SpaceScene | undefined;
  let styleEl: HTMLStyleElement | undefined;

  const ensureStyle = (): void => {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.textContent = spaceViewStyle;
    document.head.appendChild(styleEl);
  };

  const renderSettingsPanel = (): void => {
    const panel = screen?.querySelector<HTMLDivElement>("[data-space-view-settings-panel]");
    if (!panel) return;
    panel.innerHTML = settingsPanelHtml(deps.state, deps.wsUrl, deps.firebaseAuth);
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
    if (visible) scene?.resize();
  };

  const ensureMounted = (): void => {
    if (screen) return;
    ensureStyle();

    const launcherWrapper = document.createElement("div");
    launcherWrapper.innerHTML = spaceViewLauncherHtml();
    launcher = launcherWrapper.firstElementChild as HTMLButtonElement;
    hud.parentElement!.insertBefore(launcher, hud.nextSibling);
    launcher.addEventListener("click", () => {
      deps.state.activeScreen = "space";
      setScreenVisible(true);
    });

    screen = document.createElement("div");
    screen.className = "sv-screen";
    screen.hidden = true;
    screen.innerHTML = spaceViewChromeHtml(
      strategicRibbonHtml(ZERO_RESOURCES, ZERO_RESOURCES, ZERO_UPKEEP, ZERO_ANIM, () => "")
    );
    hud.parentElement!.insertBefore(screen, launcher.nextSibling);

    const canvas = screen.querySelector<HTMLCanvasElement>("[data-space-view-canvas]")!;
    scene = createSpaceScene({
      container: screen,
      canvas,
      onEnterSeason: (seasonId: string) => deps.onEnterSeason?.(seasonId)
    });

    screen.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-space-view-return]")) {
        deps.state.activeScreen = "season";
        setScreenVisible(false);
        return;
      }
      if (target.closest("[data-space-view-manage-planet]")) {
        deps.openGalaxyManage?.();
        return;
      }
      if (target.closest("[data-space-view-settings]")) {
        const panel = screen!.querySelector<HTMLDivElement>("[data-space-view-settings-panel]")!;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderSettingsPanel();
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
      if (!screen?.hidden) scene?.resize();
    });
  };

  const applyGalaxyListing = (listing: GalaxyPublicListing, mySeasonIds: ReadonlySet<string>): void => {
    const planets = [...(listing.planets ?? []), ...(listing.outposts ?? [])];
    const models = toSpacePlanetViewModels(planets, mySeasonIds);
    scene?.setPlanets(models);
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

      ensureMounted();

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
      applyGalaxyListing(listing, mySeasonIds);
    } catch {
      // Network hiccup: Space View just stays unmounted until the next auth event.
    }
  };

  if (deps.firebaseAuth) {
    onAuthStateChanged(deps.firebaseAuth, () => void load());
  }
  void load();
};

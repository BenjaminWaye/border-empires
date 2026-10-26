// Shared plumbing for the new HUD's controller and screens: the dependency
// contract, which screen is open, and a region writer that only touches the
// DOM when the HTML changed (keeping list scroll positions across rewrites).

import type { createClientActionFlow } from "../client-action-flow.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import type { ClientState } from "../client-state/client-state.js";

export type HudV2ActionFlow = Pick<
  ReturnType<typeof createClientActionFlow>,
  "chooseTech" | "cancelOngoingCapture" | "openSingleTileActionMenu" | "handleTileAction" | "hideTileActionMenu" | "tileMenuViewForTile"
>;

export type HudV2Deps = {
  state: ClientState;
  renderHud: () => void;
  requestViewRefresh: () => void;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  isMobile: () => boolean;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  actionFlow: HudV2ActionFlow;
  /** The colour the map paints an owner's land (rivals are hue-shifted away from yours); badges must match it. */
  ownerColor: (ownerId: string) => string;
};

export type HudV2ScreenId = "manifest" | "afc" | "diplomacy" | "ranks" | "chronicle" | "town" | "battle";

/** Screens drawn in the shared full-screen frame over the darkened map. */
export const FRAME_SCREENS: ReadonlySet<HudV2ScreenId> = new Set<HudV2ScreenId>(["manifest", "afc", "diplomacy", "ranks"]);

export type HudV2ScreenState = {
  id: HudV2ScreenId | null;
  manifestSelectedId: string;
  manifestClosedLanes: Set<string>;
  diplomacyTargetId: string | undefined;
  chronicleRival: string;
  chronicleSelectedId: string | undefined;
  townBuildSelection: string | undefined;
  townCategory: BuildingCategory | undefined;
};

export const screen: HudV2ScreenState = {
  id: null,
  manifestSelectedId: "",
  manifestClosedLanes: new Set<string>(),
  diplomacyTargetId: undefined,
  chronicleRival: "",
  chronicleSelectedId: undefined,
  townBuildSelection: undefined,
  townCategory: undefined
};

const written = new Map<string, string>();

/** Writes `html` into the element with `id` when it changed; restores scroll of `[data-v2-scroll]` lists. */
export const writeHtml = (id: string, html: string): void => {
  if (written.get(id) === html) return;
  const el = document.getElementById(id);
  if (!el) return;
  const scrolls = new Map<string, number>();
  el.querySelectorAll<HTMLElement>("[data-v2-scroll]").forEach((node) => scrolls.set(node.dataset.v2Scroll ?? "", node.scrollTop));
  el.innerHTML = html;
  el.querySelectorAll<HTMLElement>("[data-v2-scroll]").forEach((node) => {
    const top = scrolls.get(node.dataset.v2Scroll ?? "");
    if (top) node.scrollTop = top;
  });
  written.set(id, html);
};

/** Forget what was written under these ids (their container was replaced). */
export const forgetWritten = (...ids: string[]): void => {
  for (const id of ids) written.delete(id);
};

export const syncScreenBodyClasses = (): void => {
  const body = document.body;
  for (const cls of Array.from(body.classList)) if (cls.startsWith("hud-v2-screen-")) body.classList.remove(cls);
  if (!screen.id) return;
  body.classList.add("hud-v2-screen-open", `hud-v2-screen-${screen.id}`);
  if (FRAME_SCREENS.has(screen.id)) body.classList.add("hud-v2-screen-frame");
};

export const SCREEN_HOST_ID = "hud-v2-screen";

/** Opens `id` with its skeleton markup (no-op when it's already open). */
export const setScreen = (id: HudV2ScreenId, skeletonHtml: string): void => {
  if (screen.id === id) return;
  const host = document.getElementById(SCREEN_HOST_ID);
  if (!host) return;
  screen.id = id;
  host.innerHTML = skeletonHtml;
  written.clear();
  syncScreenBodyClasses();
};

export const clearScreen = (): void => {
  if (!screen.id) return;
  screen.id = null;
  const host = document.getElementById(SCREEN_HOST_ID);
  if (host) host.innerHTML = "";
  written.clear();
  syncScreenBodyClasses();
};

export const FRAME_SKELETON = `<div class="v2s-backdrop" aria-hidden="true"></div>
  <header class="v2s-head"><button type="button" class="v2s-back" data-v2-close><span aria-hidden="true">◁</span> Map <kbd>Esc</kbd></button><h1 class="v2s-title" id="v2s-title"></h1><div class="v2s-head-right" id="v2s-head-right"></div></header>
  <div class="v2s-body" id="v2s-body"></div>`;

export const focusCamera = (deps: Pick<HudV2Deps, "state" | "wrapX" | "wrapY" | "requestViewRefresh">, x: number, y: number): void => {
  const { state } = deps;
  state.camX = deps.wrapX(x);
  state.camY = deps.wrapY(y);
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x: state.camX, y: state.camY };
  deps.requestViewRefresh();
};

/** Viewport centre, for opening a tile menu that isn't anchored to a click. */
export const screenCentre = (): { x: number; y: number } => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

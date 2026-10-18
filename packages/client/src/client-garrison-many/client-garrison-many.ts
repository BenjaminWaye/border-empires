import { connectedOwnedFrontierKeys } from "../client-connected-region/client-connected-region.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { createGarrisonManyState, GARRISON_MANY_LIMIT, garrisonTileReason, reviewGarrisonMany, type GarrisonManyReview } from "./client-garrison-many-model.js";
import { garrisonManyHtml } from "./client-garrison-many-view.js";
import "./client-garrison-many.css";

export interface GarrisonManyDeps {
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  hideTileActionMenu: () => void;
  renderHud: () => void;
  developmentSlotSummary: () => { available: number };
  requestSettlement: (x: number, y: number, opts: { forceQueue: true; suppressWarnings: true }) => boolean;
  processDevelopmentQueue: () => void;
  pushFeed: (message: string, type?: string, severity?: string) => void;
}
export interface GarrisonManyFlow {
  begin: (tile: Tile) => void;
  select: (x: number, y: number) => boolean;
  cancel: () => void;
}

export const createGarrisonManyFlow = (state: ClientState, deps: GarrisonManyDeps): GarrisonManyFlow => {
  let sheet: HTMLElement | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let reviewed: GarrisonManyReview | undefined;
  let note = "";
  let owner = "";
  let season: string | undefined;
  let previousHtml = "";

  const cancel = (): void => {
    state.garrisonMany = createGarrisonManyState();
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    sheet?.remove();
    sheet = undefined;
    reviewed = undefined;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  };
  const sameSession = (): boolean => state.authSessionReady && state.me === owner &&
    state.cameraRestoredSeasonId === season && !state.needsSeasonJoin && state.activeScreen === "season";
  const preview = (): GarrisonManyReview => reviewGarrisonMany(state, deps.developmentSlotSummary().available);
  const render = (): void => {
    if (!state.garrisonMany.active) { cancel(); return; }
    if (!sheet) return;
    if (!sameSession()) {
      cancel();
      return;
    }
    const current = preview();
    state.garrisonMany.invalidKeys = current.excluded.map((entry) => entry.key);
    // Preserve the reviewed snapshot until confirmation. This makes a changed
    // live plan explicit instead of moving the confirmation underneath a tap.
    const html = garrisonManyHtml(state.garrisonMany.keys.length, reviewed ?? current, Boolean(reviewed), note, Boolean(reviewed && current.signature !== reviewed.signature));
    if (html !== previousHtml) {
      previousHtml = html;
      sheet.innerHTML = html;
    }
  };
  const changed = (): void => {
    reviewed = undefined;
    render();
  };
  const add = (key: string): boolean => {
    if (state.garrisonMany.keys.includes(key)) return false;
    if (state.garrisonMany.keys.length >= GARRISON_MANY_LIMIT) return false;
    if (garrisonTileReason(state, state.tiles.get(key))) return false;
    state.garrisonMany.keys.push(key);
    return true;
  };
  const select = (x: number, y: number): boolean => {
    if (!state.garrisonMany.active) return false;
    if (!sameSession()) { cancel(); return true; }
    const key = deps.keyFor(x, y);
    const index = state.garrisonMany.keys.indexOf(key);
    if (index >= 0) {
      state.garrisonMany.keys.splice(index, 1);
      note = "";
    } else {
      const reason = garrisonTileReason(state, state.tiles.get(key));
      if (reason) note = reason;
      else if (!add(key)) note = `Select up to ${GARRISON_MANY_LIMIT} tiles at a time`;
      else note = "";
    }
    changed();
    return true;
  };
  const confirm = (): void => {
    if (!reviewed || !sameSession()) {
      cancel();
      return;
    }
    const current = preview();
    if (current.signature !== reviewed.signature) {
      reviewed = current;
      note = "The selection or available resources changed. Review the updated details, then confirm again.";
      render();
      return;
    }
    if (current.blocked) return;
    const origin = state.selected;
    // Close before callbacks render the HUD; queued work retains the existing
    // FIFO dispatcher and its single-in-flight acknowledgement pacing.
    cancel();
    let queued = 0;
    for (const tile of current.tiles) {
      if (deps.requestSettlement(tile.x, tile.y, { forceQueue: true, suppressWarnings: true })) queued += 1;
    }
    if (queued) deps.processDevelopmentQueue();
    state.selected = origin;
    deps.pushFeed(`Queued ${queued} garrisons${queued !== current.tiles.length ? `; ${current.tiles.length - queued} could not be queued` : ""}.`, "combat", queued ? "info" : "warn");
    deps.renderHud();
  };
  const onAction = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-garrison]") : null;
    if (!target || target.disabled) return;
    switch (target.dataset.garrison) {
      case "cancel": cancel(); break;
      case "edit": note = ""; changed(); break;
      case "clear": state.garrisonMany.keys = []; note = ""; changed(); break;
      case "connected": {
        const root = state.tiles.get(state.garrisonMany.originKey);
        const keys = connectedOwnedFrontierKeys(state, root, deps);
        let added = 0;
        let excluded = 0;
        for (const key of keys) {
          if (state.garrisonMany.keys.includes(key)) continue;
          if (add(key)) added += 1; else excluded += 1;
        }
        note = `Added ${added} ${added === 1 ? "tile" : "tiles"}${excluded ? `; ${excluded} unavailable or beyond the ${GARRISON_MANY_LIMIT}-tile limit` : ""}.`;
        changed();
        break;
      }
      case "review": reviewed = preview(); note = ""; render(); break;
      case "confirm": confirm(); break;
    }
  };
  const begin = (tile: Tile): void => {
    cancel();
    if (!state.authSessionReady) return;
    deps.hideTileActionMenu();
    state.crystalTargeting.active = false;
    state.aetherWallTargeting.active = false;
    state.musterMarchTargeting.active = false;
    state.buildingPlacement.active = false;
    state.garrisonMany.active = true;
    state.garrisonMany.originKey = deps.keyFor(tile.x, tile.y);
    add(state.garrisonMany.originKey);
    owner = state.me;
    season = state.cameraRestoredSeasonId;
    note = "";
    previousHtml = "";
    sheet = document.createElement("section");
    sheet.className = "garrison-many-sheet";
    sheet.setAttribute("aria-label", "Garrison Many");
    sheet.addEventListener("click", onAction);
    document.body.append(sheet);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    render();
    timer = setInterval(render, 250);
  };
  return { begin, select, cancel };
};

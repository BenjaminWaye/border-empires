// The instructions shown while picking where a March To starts from
// (client-march-origin-picking.ts): a button per nearby muster flag that can
// reach the destination (only when there is one), plus how to raise a new
// flag by tapping a tile of the player's land. While picking, an arrow runs
// from the hovered tile of the player's land to the destination through
// state.arrowGesture, which the 2D (client-runtime-loop.ts) and true-3D
// (client-map-3d-arrow-overlay.ts) renderers both draw.

import { marchAttackOptions, type MarchAttackOrigin } from "../client-march-attack-actions/client-march-attack-actions.js";
import type { ClientState } from "../client-state/client-state.js";

export const MARCH_ORIGIN_BANNER_ID = "march-origin-hint";

export type MarchOriginBannerModel = {
  target: { x: number; y: number };
  flags: MarchAttackOrigin[];
  canRaiseFlag: boolean;
};

export type MarchOriginBannerHandlers = {
  onPickFlag: (x: number, y: number) => void;
  onCancel: () => void;
};

/** Previewing the hovered origin (so hiding knows the arrow is ours to clear). */
let previewShown = false;
let frameRunning = false;

export const marchOriginBannerModel = (state: ClientState, nowMs = Date.now()): MarchOriginBannerModel => {
  const target = { x: state.marchOriginPicking.targetX, y: state.marchOriginPicking.targetY };
  const options = marchAttackOptions(state, target, nowMs);
  return { target, flags: options.flags, canRaiseFlag: Boolean(options.newFlag) };
};

const BUTTON_STYLE = "font:inherit;padding:4px 10px;border-radius:6px;border:1px solid #ffd54a;background:transparent;color:inherit;cursor:pointer";

export const marchOriginBannerHtml = (model: MarchOriginBannerModel): string => {
  const { target, flags, canRaiseFlag } = model;
  const parts = [`<strong>March to (${target.x}, ${target.y})</strong>`];
  if (flags.length > 0) {
    parts.push("<span>Select one of your nearby muster flags to march from:</span>");
    const buttons = flags
      .map((flag) => `<button type="button" data-march-origin-flag="${flag.x},${flag.y}" style="${BUTTON_STYLE}">Flag (${flag.x}, ${flag.y}) · ${flag.distance} tiles</button>`)
      .join("");
    parts.push(`<span style="display:flex;flex-wrap:wrap;gap:6px">${buttons}</span>`);
  }
  if (canRaiseFlag) {
    parts.push(`<span>${flags.length > 0 ? "Or tap" : "Tap"} a tile of your land to raise a new muster flag there and march from it.</span>`);
  } else if (flags.length === 0) {
    parts.push("<span>No muster flag or tile of your land can reach this tile.</span>");
  }
  parts.push(`<button type="button" data-march-origin-cancel style="${BUTTON_STYLE};align-self:flex-end">Cancel</button>`);
  return parts.join("");
};

const bannerEl = (): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(MARCH_ORIGIN_BANNER_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = MARCH_ORIGIN_BANNER_ID;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:60;display:none;flex-direction:column;gap:8px;" +
    "padding:10px 14px;border-radius:10px;background:rgba(20,18,12,0.92);border:1px solid #ffd54a;color:#fff3c4;" +
    "font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.45);max-width:calc(100vw - 32px)";
  document.body.appendChild(el);
  return el;
};

/** Per-frame while picking: the arrow from the hovered tile of the player's land to the destination. */
export const syncMarchOriginPreview = (state: ClientState): void => {
  if (state.pendingArrowGestureConfirm) return;
  const { active, targetX, targetY } = state.marchOriginPicking;
  const hover = state.hover;
  const hoverTile = hover ? state.tiles.get(`${hover.x},${hover.y}`) : undefined;
  const origin =
    active && hover && hoverTile?.ownerId === state.me && hoverTile.terrain === "LAND" && !(hover.x === targetX && hover.y === targetY)
      ? hover
      : undefined;
  if (!origin) {
    if (previewShown) state.arrowGesture = undefined;
    previewShown = false;
    return;
  }
  const current = state.arrowGesture;
  if (!current || current.origin.x !== origin.x || current.origin.y !== origin.y || current.target.x !== targetX || current.target.y !== targetY) {
    state.arrowGesture = { origin: { x: origin.x, y: origin.y }, target: { x: targetX, y: targetY } };
  }
  previewShown = true;
};

const runPreviewFrames = (state: ClientState): void => {
  if (frameRunning || typeof requestAnimationFrame === "undefined") return;
  frameRunning = true;
  const frame = (): void => {
    syncMarchOriginPreview(state);
    if (state.marchOriginPicking.active) requestAnimationFrame(frame);
    else frameRunning = false;
  };
  requestAnimationFrame(frame);
};

export const showMarchOriginBanner = (state: ClientState, handlers: MarchOriginBannerHandlers): void => {
  const el = bannerEl();
  if (el) {
    el.innerHTML = marchOriginBannerHtml(marchOriginBannerModel(state));
    el.querySelectorAll<HTMLElement>("[data-march-origin-flag]").forEach((button) => {
      const [x, y] = (button.dataset.marchOriginFlag ?? "").split(",").map(Number);
      button.addEventListener("click", () => handlers.onPickFlag(x!, y!));
    });
    el.querySelector("[data-march-origin-cancel]")?.addEventListener("click", handlers.onCancel);
    el.style.display = "flex";
  }
  runPreviewFrames(state);
};

export const hideMarchOriginBanner = (state: ClientState): void => {
  if (previewShown && !state.pendingArrowGestureConfirm) state.arrowGesture = undefined;
  previewShown = false;
  const el = typeof document === "undefined" ? null : document.getElementById(MARCH_ORIGIN_BANNER_ID);
  if (el) el.style.display = "none";
};

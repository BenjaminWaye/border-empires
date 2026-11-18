// The armed-targeting card (#targeting-overlay) shown while a map pick is
// waiting for a tap: Aether Wall, the other Crystal abilities, and Send scout
// drone from an AFC's menu (client-scout-drone/client-scout-drone-picking.ts).
// Each card has a Cancel button; Escape cancels too (client-map-input.ts).
import { cancelScoutDronePicking } from "../client-scout-drone/client-scout-drone-picking.js";
import type { ClientState } from "../client-state/client-state.js";

export type TargetingOverlayDeps = {
  crystalTargetingTone: (ability: ClientState["crystalTargeting"]["ability"]) => string;
  crystalTargetingTitle: (ability: ClientState["crystalTargeting"]["ability"]) => string;
  clearCrystalTargeting: () => void;
  keyFor: (x: number, y: number) => string;
  parseKey: (key: string) => { x: number; y: number };
  rerender: () => void;
};

export const SCOUT_DRONE_PICKING_CARD_HTML = `
      <div class="targeting-card tone-amber">
        <div class="targeting-kicker">Scout Drone Ready</div>
        <div class="targeting-title">Send scout drone</div>
        <div class="targeting-detail">Tap a tile beyond your land. The drone launches from your AFC nearest that tile, reveals land as it flies, and claims nothing.</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;

export const renderTargetingOverlay = (state: ClientState, overlayEl: HTMLElement, deps: TargetingOverlayDeps): void => {
  const { crystalTargetingTone, crystalTargetingTitle, clearCrystalTargeting, keyFor, parseKey } = deps;
  if (state.aetherWallTargeting.active) {
    const status = state.selected ? `Origin ${state.selected.x}, ${state.selected.y}` : `Valid origins in view: ${state.aetherWallTargeting.validOrigins.size}`;
    overlayEl.innerHTML = `
      <div class="targeting-card tone-amber">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">Aether Wall</div>
        <div class="targeting-detail">Select one of your garrisoned border tiles, then cast. If more than one facing is valid, tap one of the glowing map arrows.</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    overlayEl.style.display = "block";
    const cancelBtn = overlayEl.querySelector("#targeting-cancel") as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        deps.rerender();
      };
    }
  } else if (state.crystalTargeting.active) {
    const ability = state.crystalTargeting.ability;
    const selectedKey = state.selected ? keyFor(state.selected.x, state.selected.y) : "";
    const selectedOriginKey = selectedKey ? state.crystalTargeting.originByTarget.get(selectedKey) : undefined;
    const selectedOrigin = selectedOriginKey ? parseKey(selectedOriginKey) : undefined;
    const validCount = state.crystalTargeting.validTargets.size;
    const detail =
      ability === "aether_bridge"
        ? "Pick a coastal land tile. The server links the nearest garrisoned coast and opens a temporary sea lane. Enemy land glowing red inside a red outline is shielded by an Aether Tower and can't be landed on."
        : ability === "siphon"
          ? "Pick an enemy town or resource tile. One of your Aether Towers drains the 3x3 around it (resource slots move to you) until you cancel it from that tower. Land glowing red inside a red outline is shielded by an enemy Aether Tower and can't be siphoned."
          : "Pick an enemy land tile to shatter into mountain and erase whatever was built there.";
    const status = selectedOrigin
      ? `Origin ${selectedOrigin.x}, ${selectedOrigin.y} → Target ${state.selected?.x}, ${state.selected?.y}`
      : `Valid targets in view: ${validCount}`;
    overlayEl.innerHTML = `
      <div class="targeting-card tone-${crystalTargetingTone(ability)}">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">${crystalTargetingTitle(ability)}</div>
        <div class="targeting-detail">${detail}</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    overlayEl.style.display = "block";
    const cancelBtn = overlayEl.querySelector("#targeting-cancel") as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        deps.rerender();
      };
    }
  } else if (state.scoutDronePicking.active) {
    overlayEl.innerHTML = SCOUT_DRONE_PICKING_CARD_HTML;
    overlayEl.style.display = "block";
    const cancelBtn = overlayEl.querySelector("#targeting-cancel") as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        cancelScoutDronePicking(state);
        deps.rerender();
      };
    }
  } else {
    overlayEl.style.display = "none";
    overlayEl.innerHTML = "";
  }
};

// "Name Island" / "Rename Island" in the tile menu of any tile on an island
// the player fully garrisons, and the small dialog it opens. The simulation
// re-checks the hold and the name (NAME_ISLAND); the dialog only pre-checks
// the name with the same shared rule so typos fail fast.
import { terrainAt, validateIslandName } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedSeverity, FeedType, Tile, TileActionDef } from "../client-types.js";
import { fullyHeldIslandIdAt } from "./client-island-hold.js";

type IslandActionState = Pick<ClientState, "me" | "tiles" | "tilesRevision" | "islandLabels">;

// One walk per tile per tiles revision: the menu re-renders often while open.
let cachedHold: { revision: number; me: string; key: string; islandId: string | undefined } | undefined;

const heldIslandIdForTile = (state: IslandActionState, tile: Tile): string | undefined => {
  const key = `${tile.x},${tile.y}`;
  if (cachedHold && cachedHold.revision === state.tilesRevision && cachedHold.me === state.me && cachedHold.key === key) return cachedHold.islandId;
  const islandId = fullyHeldIslandIdAt(tile.x, tile.y, {
    me: state.me,
    tileAt: (x, y) => state.tiles.get(`${x},${y}`),
    terrainAt
  });
  cachedHold = { revision: state.tilesRevision, me: state.me, key, islandId };
  return islandId;
};

export const appendIslandNameAction = (actions: TileActionDef[], state: IslandActionState, tile: Tile): TileActionDef[] => {
  if (!state.me || tile.fogged || tile.terrain !== "LAND" || tile.ownerId !== state.me || tile.ownershipState !== "SETTLED") return actions;
  const islandId = heldIslandIdForTile(state, tile);
  if (!islandId) return actions;
  const current = state.islandLabels?.find((label) => label.id === islandId);
  const chosenByMe = current?.namerId === state.me;
  actions.push({
    id: "name_island",
    label: chosenByMe ? "Rename Island" : "Name Island",
    detail: current ? `Now "${current.name}" · you garrison the whole island` : "You garrison the whole island",
    disabled: false
  });
  return actions;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const MODAL_ID = "island-name-overlay";

const openIslandNameModal = (currentName: string, onSubmit: (name: string) => void): void => {
  document.getElementById(MODAL_ID)?.remove();
  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.style.cssText = "display:grid;position:fixed;inset:0;z-index:9000;place-items:center;";
  overlay.innerHTML = `
  <div class="profile-edit-backdrop" data-island-name-cancel></div>
  <div class="profile-edit-modal card" role="dialog" aria-modal="true" aria-labelledby="island-name-title">
    <div class="auth-onboarding-head">
      <div id="island-name-title" class="auth-panel-title">Name this island</div>
      <div class="auth-panel-subtitle">Every tile is garrisoned by you. The name stays on the map while you hold most of it, and fades a day after you lose your grip.</div>
    </div>
    <input class="auth-style-input" type="text" maxlength="28" autocomplete="off" value="${escapeHtml(currentName)}" data-island-name-input />
    <div class="auth-panel-subtitle" data-island-name-error role="alert"></div>
    <div class="profile-edit-actions">
      <button type="button" class="panel-btn" data-island-name-cancel>Cancel</button>
      <button type="button" class="panel-btn" data-island-name-save>Name Island</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector<HTMLInputElement>("[data-island-name-input]")!;
  const error = overlay.querySelector<HTMLElement>("[data-island-name-error]")!;
  const close = (): void => overlay.remove();
  const save = (): void => {
    const result = validateIslandName(input.value);
    if (!result.ok) {
      error.textContent = result.reason.charAt(0).toUpperCase() + result.reason.slice(1) + ".";
      return;
    }
    onSubmit(result.name);
    close();
  };
  overlay.querySelectorAll<HTMLElement>("[data-island-name-cancel]").forEach((element) => { element.onclick = close; });
  overlay.querySelector<HTMLButtonElement>("[data-island-name-save]")!.onclick = save;
  input.onkeydown = (event) => {
    if (event.key === "Enter") save();
    if (event.key === "Escape") close();
  };
  input.focus();
  input.select();
};

export type IslandNameActionDeps = {
  readonly state: IslandActionState;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
  readonly pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
};

/** Handles "name_island"; returns false for any other action id. */
export const dispatchIslandNameTileAction = (actionId: string, tile: Tile, deps: IslandNameActionDeps): boolean => {
  if (actionId !== "name_island") return false;
  const islandId = heldIslandIdForTile(deps.state, tile);
  const current = islandId ? deps.state.islandLabels?.find((label) => label.id === islandId) : undefined;
  openIslandNameModal(current?.name ?? "", (name) => {
    if (deps.sendGameMessage({ type: "NAME_ISLAND", x: tile.x, y: tile.y, name })) deps.pushFeed(`Naming the island ${name}…`, "info", "info");
  });
  return true;
};

// Runtime for the battle screen. Attack from the action bar on a garrisoned
// tile opens the existing effort sheet; while it's open this screen shows the
// face-off and forwards Effort / Confirm / Back to the sheet's own buttons
// (the sheet still validates and sends). After launch it follows the live
// capture, then shows whether the tile fell. Frontier attacks never get here:
// the sheet only opens for garrisoned targets.

import type { Tile, TileActionDef, TileCombatBreakdown, TileMenuView } from "../client-types.js";
import { battleLiveHtml, battlePreviewHtml, battleResultHtml, parseWinPct, type BattleEffort, type BattleSide } from "./client-hud-v2-battle.js";
import { BATTLE_ZOOM, closeUpOn, endCloseUp } from "./client-hud-v2-camera.js";
import { clearScreen, focusCamera, screen, setScreen, writeHtml, type HudV2Deps } from "./client-hud-v2-context.js";
import { isHudV2Active } from "./client-hud-v2-flag.js";

type BattleMode = "preview" | "pending" | "live" | "result";

type Battle = {
  mode: BattleMode;
  tileKey: string;
  coords: { x: number; y: number };
  title: string;
  defenderId: string;
  breakdown: TileCombatBreakdown | undefined;
  since: number;
  winPct: number | undefined;
  won?: boolean;
  headline?: string;
  detail?: string;
  manpowerLoss?: number | undefined;
};

const ATTACK_CONTEXT_TTL_MS = 4_000;
const PENDING_TIMEOUT_MS = 5_000;
const SHEET = ".effort-confirm-overlay";

let attack: { tileKey: string; view: TileMenuView; at: number } | undefined;
let battle: Battle | undefined;
let battleDeps: HudV2Deps | undefined;
/** Set when the sheet was confirmed (its Go button or Enter), so closing it means "launched", not "backed out". */
let confirmed = false;

/** Tile menu titles end in "(x, y)"; the battle header shows coordinates on their own line. */
const stripCoords = (title: string): string => title.replace(/\s*\(-?\d+,\s*-?\d+\)\s*$/, "");

const BATTLE_SKELETON = `<div class="v2b-vignette" aria-hidden="true"></div><div class="v2b-stage" id="v2b-stage"></div>`;

export const battleOnBarAction = (actionId: TileActionDef["id"], view: TileMenuView, tileKey: string): void => {
  if (actionId === "launch_attack") attack = { tileKey, view, at: Date.now() };
};

/** The attack preview arrives after the first render; keep the latest odds for the open battle. */
export const battleOnMenuView = (view: TileMenuView, tileKey: string): void => {
  if (attack?.tileKey === tileKey) attack.view = view;
  if (battle?.tileKey === tileKey && view.combatBreakdown) battle.breakdown = view.combatBreakdown;
};

const sideFor = (deps: HudV2Deps, id: string, role: string, sub: string): BattleSide => ({
  id,
  name: id === deps.state.me ? deps.state.playerNames.get(id) ?? "You" : deps.state.playerNames.get(id) ?? "Empire",
  color: deps.state.playerColors.get(id),
  role,
  sub
});

const sides = (deps: HudV2Deps, b: Battle): { you: BattleSide; them: BattleSide } => {
  const tile = deps.state.tiles.get(b.tileKey);
  const origin = deps.state.capture?.origin;
  const them = sideFor(deps, b.defenderId, `${(deps.state.playerNames.get(b.defenderId) ?? "Defender").toUpperCase()} · DEFENDING`, tile?.ownershipState === "SETTLED" ? "Garrisoned" : "Holding ground");
  return { you: sideFor(deps, deps.state.me, "YOU · ATTACKING", origin ? `From (${origin.x}, ${origin.y})` : ""), them };
};

const onSheetOpened = (deps: HudV2Deps): void => {
  if (!isHudV2Active(deps.isMobile) || !attack || Date.now() - attack.at > ATTACK_CONTEXT_TTL_MS) return;
  if (screen.id !== null && screen.id !== "battle") return;
  const tile: Tile | undefined = deps.state.tiles.get(attack.tileKey);
  if (!tile?.ownerId) return;
  battle = {
    mode: "preview",
    tileKey: attack.tileKey,
    coords: { x: tile.x, y: tile.y },
    title: stripCoords(attack.view.title),
    defenderId: tile.ownerId,
    breakdown: attack.view.combatBreakdown,
    since: Date.now(),
    winPct: undefined
  };
  attack = undefined;
  confirmed = false;
  closeUpOn(deps, tile.x, tile.y, BATTLE_ZOOM);
  setScreen("battle", BATTLE_SKELETON);
  renderBattle(deps);
};

const onSheetClosed = (): void => {
  if (battle?.mode !== "preview") return;
  if (!confirmed) {
    closeBattle();
    return;
  }
  battle.mode = "pending";
  battle.since = Date.now();
};

/** Watches for the effort sheet being added to / removed from the page. */
export const installBattleWatch = (deps: HudV2Deps): void => {
  battleDeps = deps;
  const isSheet = (node: Node): boolean => node instanceof HTMLElement && node.matches(SHEET);
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(`${SHEET} [data-effort-go]`)) confirmed = true;
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && document.querySelector(SHEET) && !(event.target instanceof HTMLButtonElement)) confirmed = true;
  }, true);
  new MutationObserver((records) => {
    for (const record of records) {
      if (Array.from(record.addedNodes).some(isSheet)) onSheetOpened(deps);
      if (Array.from(record.removedNodes).some(isSheet)) onSheetClosed();
    }
  }).observe(document.body, { childList: true });
};

const sheetEfforts = (): BattleEffort[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(`${SHEET} [data-effort-preset]`)).map((btn) => ({
    key: btn.dataset.effortPreset ?? "",
    label: btn.querySelector("span")?.textContent ?? btn.dataset.effortPreset ?? "",
    amount: Number(btn.dataset.effortAmount ?? 0),
    active: btn.classList.contains("is-active")
  }));

const captureMatches = (deps: HudV2Deps, b: Battle): boolean => {
  const c = deps.state.capture;
  return Boolean(c && `${c.target.x},${c.target.y}` === b.tileKey);
};

const resolve = (deps: HudV2Deps, b: Battle): void => {
  const alert = deps.state.captureAlert;
  const fresh = alert && alert.until > Date.now() ? alert : undefined;
  b.won = deps.state.tiles.get(b.tileKey)?.ownerId === deps.state.me;
  b.headline = b.won ? "Tile captured" : "Defender held";
  b.detail = fresh?.detail ?? (b.won ? "The tile is yours" : `${deps.state.playerNames.get(b.defenderId) ?? "The defender"} kept the tile`);
  b.manpowerLoss = fresh?.manpowerLoss;
  b.mode = "result";
  b.since = Date.now();
};

export const renderBattle = (deps: HudV2Deps): void => {
  const b = battle;
  if (!b || screen.id !== "battle") return;
  const now = Date.now();
  if (b.mode === "pending") {
    if (captureMatches(deps, b)) {
      b.mode = "live";
      b.winPct = deps.state.capture?.combatSnapshot ? Math.round(deps.state.capture.combatSnapshot.winChance * 100) : b.winPct;
    } else if (now - b.since > PENDING_TIMEOUT_MS) {
      closeBattle();
      return;
    } else {
      return;
    }
  }
  if (b.mode === "live" && !captureMatches(deps, b)) resolve(deps, b);
  const { you, them } = sides(deps, b);
  const base = { title: b.title, coords: b.coords, you, them, breakdown: b.breakdown };
  if (b.mode === "preview") {
    const info = document.querySelector(`${SHEET} [data-effort-info]`)?.textContent;
    b.winPct = parseWinPct(info) ?? b.winPct;
    const value = Number(document.querySelector(`${SHEET} [data-effort-value]`)?.textContent ?? NaN);
    writeHtml("v2b-stage", battlePreviewHtml({ ...base, winPct: b.winPct, efforts: sheetEfforts(), commit: Number.isFinite(value) ? value : undefined }));
    return;
  }
  if (b.mode === "live") {
    const c = deps.state.capture;
    const total = c ? Math.max(1, Math.round((c.resolvesAt - c.startAt) / 1000)) : 1;
    const left = c ? Math.max(0, Math.ceil((c.resolvesAt - now) / 1000)) : 0;
    writeHtml("v2b-stage", battleLiveHtml({ ...base, winPct: b.winPct, secondsLeft: left, totalSeconds: total }));
    return;
  }
  writeHtml("v2b-stage", battleResultHtml({ ...base, won: b.won ?? false, headline: b.headline ?? "", detail: b.detail ?? "", manpowerLoss: b.manpowerLoss }));
};

/** `keepPosition` leaves the camera on the tile (Show tile) instead of returning to the earlier view. */
export const closeBattle = (keepPosition = false): void => {
  battle = undefined;
  if (battleDeps) endCloseUp(battleDeps, keepPosition);
  if (screen.id === "battle") clearScreen();
};

/** Re-open the live view from the tracker's battle row. */
export const reopenLiveBattle = (deps: HudV2Deps): boolean => {
  const c = deps.state.capture;
  if (!c || c.actionType !== "ATTACK" || screen.id) return false;
  const tile = deps.state.tiles.get(`${c.target.x},${c.target.y}`);
  if (!tile?.ownerId || tile.ownerId === deps.state.me) return false;
  battle = {
    mode: "live",
    tileKey: `${tile.x},${tile.y}`,
    coords: { x: tile.x, y: tile.y },
    title: stripCoords(deps.actionFlow.tileMenuViewForTile(tile).title),
    defenderId: tile.ownerId,
    breakdown: undefined,
    since: Date.now(),
    winPct: c.combatSnapshot ? Math.round(c.combatSnapshot.winChance * 100) : undefined
  };
  closeUpOn(deps, tile.x, tile.y, BATTLE_ZOOM);
  setScreen("battle", BATTLE_SKELETON);
  renderBattle(deps);
  return true;
};

const clickSheet = (selector: string): void => document.querySelector<HTMLButtonElement>(`${SHEET} ${selector}`)?.click();

/** Clicks inside the battle screen; true when handled. */
export const battleClick = (deps: HudV2Deps, target: Element): boolean => {
  const effort = target.closest<HTMLElement>("[data-v2-battle-effort]");
  if (effort) {
    clickSheet(`[data-effort-preset="${effort.dataset.v2BattleEffort ?? ""}"]`);
    renderBattle(deps);
    return true;
  }
  if (target.closest("[data-v2-battle-go]")) {
    clickSheet("[data-effort-go]");
    return true;
  }
  if (target.closest("[data-v2-battle-cancel]")) {
    clickSheet("[data-effort-cancel]");
    closeBattle();
    return true;
  }
  if (target.closest("[data-v2-battle-abort]")) {
    deps.actionFlow.cancelOngoingCapture();
    closeBattle();
    return true;
  }
  if (target.closest("[data-v2-battle-show]") && battle) {
    const { x, y } = battle.coords;
    closeBattle(true);
    focusCamera(deps, x, y);
    deps.renderHud();
    return true;
  }
  return false;
};

/** Esc on the battle screen: the sheet handles its own Esc while it's open. */
export const battleEscape = (): void => {
  if (document.querySelector(SHEET)) return;
  closeBattle();
};

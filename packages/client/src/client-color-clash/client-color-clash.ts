import { empireColorChecker, nearestFreeEmpireColor, type EmpireColorEntry, type EmpireColorsInUse } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

// Marks colours in the two empire-colour pickers ("Found your first standard"
// and "Update your empire") that the gateway would refuse, and offers the
// colour it would suggest. Both sides run the shared empireColorRejection /
// nearestFreeEmpireColor rule against the same colours in use: the gateway
// sends its set (colorsInUse) in INIT, PLAYER_UPDATE and every COLOR_TAKEN.
// Playtest 2026-11-28: the client used to check only the empires it had seen
// on the map, so swatches it showed as free were refused on "Enter the map".

const HEX6 = /^#[0-9a-f]{6}$/;

// The gateway's last colorsInUse. Kept here, not on ClientState (at its line
// cap), like the profile-change allowance flags.
let serverColorsInUse: EmpireColorsInUse | undefined;

const isEmpireEntry = (value: unknown): value is EmpireColorEntry =>
  typeof value === "object" && value !== null &&
  typeof (value as EmpireColorEntry).playerId === "string" && typeof (value as EmpireColorEntry).color === "string";

/** Stores `colorsInUse` from an INIT / PLAYER_UPDATE / COLOR_TAKEN message; `init` clears it when absent (an older gateway). */
export const applyServerColorsInUse = (source: Record<string, unknown>, init: boolean): void => {
  const raw = source.colorsInUse as { exact?: unknown; empires?: unknown } | undefined;
  if (raw && Array.isArray(raw.exact) && Array.isArray(raw.empires)) {
    serverColorsInUse = {
      exact: raw.exact.filter((hex): hex is string => typeof hex === "string"),
      empires: raw.empires.filter(isEmpireEntry)
    };
  } else if (init) {
    serverColorsInUse = undefined;
  }
};

/** Every other empire's colour the client knows (barbarians are not an empire). */
export const rivalEmpireColors = (state: Pick<ClientState, "me" | "playerColors" | "playerNames">): EmpireColorEntry[] => {
  const rivals: EmpireColorEntry[] = [];
  for (const [playerId, rawColor] of state.playerColors) {
    if (playerId === state.me || playerId.startsWith("barbarian")) continue;
    const color = rawColor.trim().toLowerCase();
    if (HEX6.test(color)) rivals.push({ playerId, name: state.playerNames.get(playerId), color });
  }
  return rivals;
};

/**
 * The colours a pick is checked against: the gateway's set, with each listed
 * empire's colour refreshed from PLAYER_STYLE updates since; before the
 * gateway has sent one, the empires seen on the map.
 */
export const colorsInUseFor = (state: Pick<ClientState, "me" | "playerColors" | "playerNames">): EmpireColorsInUse => {
  if (!serverColorsInUse) return { exact: [], empires: rivalEmpireColors(state) };
  const empires = serverColorsInUse.empires.map((empire) => {
    const live = state.playerColors.get(empire.playerId)?.trim().toLowerCase();
    return live && HEX6.test(live) && empire.playerId !== state.me ? { ...empire, color: live } : empire;
  });
  return { exact: serverColorsInUse.exact, empires };
};

// One checker per set of colours in use. empireColorRejection builds a fresh
// checker per call, and on a full map every "too close" verdict scans all
// ~1,800 candidates against every empire (CIEDE2000) to confirm the map is
// full. The pickers check each swatch plus the custom colour on every HUD
// render, so on a crowded sector that rescan cost ~300 ms per render and froze
// the game on phones (bug report bc313812). The checker memoises the scan, so
// it now runs once per change to the colours in use.
type CachedChecker = { readonly key: string; readonly checker: ReturnType<typeof empireColorChecker>; readonly suggestions: Map<string, string | undefined> };
let cachedChecker: CachedChecker | undefined;

const inUseKey = (inUse: EmpireColorsInUse): string =>
  `${inUse.exact.join(",")}|${inUse.empires.map((empire) => `${empire.playerId}=${empire.color}=${empire.name ?? ""}`).join(",")}`;

const cachedCheckerFor = (inUse: EmpireColorsInUse): CachedChecker => {
  const key = inUseKey(inUse);
  if (cachedChecker?.key !== key) cachedChecker = { key, checker: empireColorChecker(inUse), suggestions: new Map() };
  return cachedChecker;
};

/** Why `hex` can't be picked, or undefined when it can. */
export const colorClashReason = (hex: string, inUse: EmpireColorsInUse): string | undefined => {
  const color = hex.trim().toLowerCase();
  if (!HEX6.test(color)) return undefined;
  return cachedCheckerFor(inUse).checker.rejection(color)?.message;
};

/** The colour the gateway would suggest instead of `hex`, memoised with the checker. */
const suggestedColorFor = (hex: string, inUse: EmpireColorsInUse): string | undefined => {
  const { suggestions } = cachedCheckerFor(inUse);
  const color = hex.trim().toLowerCase();
  if (!suggestions.has(color)) suggestions.set(color, nearestFreeEmpireColor(color, inUse));
  return suggestions.get(color);
};

/** Greys out and labels swatches whose colour the gateway would refuse. */
export const markClashingSwatches = (buttons: NodeListOf<HTMLButtonElement> | HTMLButtonElement[], inUse: EmpireColorsInUse): void => {
  buttons.forEach((btn) => {
    const reason = btn.dataset.color ? colorClashReason(btn.dataset.color, inUse) : undefined;
    btn.disabled = reason !== undefined;
    btn.dataset.tooClose = reason ? "true" : "false";
    if (reason) btn.title = reason;
    else btn.removeAttribute("title");
  });
};

/**
 * Shows why the picked colour would be refused in `clashEl`, with a one-tap
 * button for the colour the gateway would suggest (`onApply`). A colour the
 * player already holds (`ownColor`) is never flagged: only new picks are checked.
 */
export const syncColorClashNote = (
  clashEl: HTMLElement | null | undefined,
  color: string,
  inUse: EmpireColorsInUse,
  ownColor?: string,
  onApply?: (hex: string) => void
): string | undefined => {
  const unchanged = ownColor !== undefined && ownColor.toLowerCase() === color.toLowerCase();
  const reason = unchanged ? undefined : colorClashReason(color, inUse);
  if (clashEl) {
    clashEl.textContent = reason ?? "";
    clashEl.hidden = reason === undefined;
    const suggestion = reason && onApply ? suggestedColorFor(color, inUse) : undefined;
    if (suggestion && onApply) {
      const tryBtn = document.createElement("button");
      tryBtn.type = "button";
      tryBtn.className = "auth-color-clash-try";
      tryBtn.dataset.suggestColor = suggestion;
      tryBtn.style.setProperty("--swatch", suggestion);
      tryBtn.textContent = "Use this";
      tryBtn.setAttribute("aria-label", `Use ${suggestion}`);
      tryBtn.onclick = () => onApply(suggestion);
      clashEl.append(" ", tryBtn);
    }
  }
  return reason;
};

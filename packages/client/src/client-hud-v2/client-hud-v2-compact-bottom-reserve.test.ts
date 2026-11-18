// Guard for the phone tab bar (client-hud-v2-compact-overlays.css). Every fixed, bottom-docked rule in the
// client's stylesheets (and the styles some modules inject from TypeScript) must keep clear of the tab bar on a
// phone. Placement's Cancel/Confirm (bottom: 12px) and the discovery tip (bottom: 10px) shipped under or over the
// tabs at 375x580 (playtest 2026-11-14). happy-dom does not resolve the cascade, so the contract is checked in the
// sources: a new rule fails here until it reserves var(--v2c-bottom), replaces the tab bar, or is listed below.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
/** The tab bar is drawn inside .hud-v2-top (z-index 50 in #hud). */
const TAB_BAR_Z = 50;
/** var(--v2c-bottom) on a phone without a safe area: a px bottom at least this high clears the tab bar. */
const TAB_BAR_CLEAR_PX = 64;

type Verdict =
  /** A compact rule (any file) for this selector ends above the tab bar, or docks at 0 over it. */
  | { kind: "lifted"; token: string }
  /** The rule's own z-index is above the tab bar's: a modal or sheet that may cover it. */
  | { kind: "above" }
  /** Never shown alongside the tab bar. */
  | { kind: "exempt"; why: string };

const VERDICTS: Record<string, Verdict> = {
  "client-break-pact-sheet/client-break-pact-sheet-style.css :: .break-pact-overlay": { kind: "above" },
  "client-discovery-tips/client-discovery-tip-overlay.ts :: #discovery-tip-overlay": { kind: "lifted", token: "#discovery-tip-overlay" },
  "client-effort-confirm-sheet/client-effort-confirm-sheet-style.css :: .effort-confirm-overlay": { kind: "above" },
  "client-garrison-many/client-garrison-many.css :: .garrison-many-sheet": { kind: "above" },
  "client-guest-save-style.css :: .guest-save-badge": { kind: "lifted", token: ".guest-save-badge" },
  "client-hud-v2/client-hud-v2-compact.css :: body.hud-v2-compact .hud-v2-nav": { kind: "exempt", why: "it is the tab bar" },
  "client-hud-v2/client-hud-v2-compact.css :: .hud-v2-sheet": { kind: "above" },
  "client-hud-v2/client-hud-v2-screens.css :: .v2s-body": { kind: "lifted", token: ".v2s-body" },
  "client-hud-v2/client-hud-v2-screens.css :: .v2c-drawer": { kind: "lifted", token: ".v2c-drawer" },
  "client-hud-v2/client-hud-v2-town-battle.css :: .v2t-left": { kind: "exempt", why: "town screen hides the tab bar" },
  "client-hud-v2/client-hud-v2-town-battle.css :: #v2t-bar.v2t-bar": { kind: "exempt", why: "town screen hides the tab bar; its bar takes the foot" },
  "client-hud-v2/client-hud-v2-town-plot-pick.css :: body.hud-v2-town-plot-picking .v2t-pick:not(:empty)": { kind: "exempt", why: "town screen hides the tab bar; the pick bar takes the foot" },
  "client-hud-v2/client-hud-v2-town-battle.css :: .v2b-panel": { kind: "exempt", why: "battle screen hides .hud-v2-top, tab bar included" },
  "client-hud-v2/client-hud-v2.css :: .hud-v2-tile": { kind: "lifted", token: ".hud-v2-tile" },
  "client-hud-v2/client-hud-v2.css :: .hud-v2-orb-slot": { kind: "lifted", token: ".hud-v2-orb-slot" },
  "client-photo-mode-style.css :: #photo-mode-exit-control": { kind: "exempt", why: "photo mode hides the HUD" },
  "client-placement-overlay-style.css :: #placement-overlay": { kind: "lifted", token: "#placement-overlay" },
  "client-refineries/refinery-choice-sheet.css :: .refinery-sheet-dock": { kind: "above" },
  "client-relic-dialog/relic-capture-dialog.css :: .relic-recapture-notice": { kind: "above" },
  "client-space-view/client-space-view-html.ts :: .sv-actions": { kind: "exempt", why: "space view replaces the planet HUD" },
  "style.css :: #mini-map-wrap": { kind: "lifted", token: "#mini-map-wrap" },
  "style.css :: #side-panel": { kind: "lifted", token: "#side-panel" }
};

type Rule = { file: string; selector: string; body: string };

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });

const rules: Rule[] = sourceFiles(SRC).flatMap((path) => {
  const text = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (!text.includes("bottom")) return [];
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    file: relative(SRC, path),
    selector: selector!.trim().split("\n").pop()!.trim(),
    body: body!
  }));
});

const declared = (body: string, prop: string): string | undefined => new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;!}]+)`).exec(body)?.[1]?.trim();
const zIndex = (body: string): number => Number(declared(body, "z-index") ?? NaN);
const reservesTabBar = (bottom: string): boolean => /--v2c-bottom|--mobile-nav-height/.test(bottom);
const clearsTabBar = (bottom: string): boolean => {
  if (bottom === "auto" || reservesTabBar(bottom)) return true;
  const px = [...bottom.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  return px.length > 0 && Math.max(...px) >= TAB_BAR_CLEAR_PX;
};

const bottomDocked = rules.filter((r) => /position:\s*fixed/.test(r.body) && declared(r.body, "bottom") !== undefined && !clearsTabBar(declared(r.body, "bottom")!));
const keyOf = (r: Rule): string => `${r.file} :: ${r.selector}`;

const lifted = (token: string): boolean =>
  rules.some((r) => {
    if (!r.selector.includes("hud-v2-compact") && !r.body.includes("--mobile-nav-height")) return false;
    if (!r.selector.split(",").some((s) => s.includes(token))) return false;
    const bottom = declared(r.body, "bottom");
    if (!bottom) return false;
    return reservesTabBar(bottom) || (/^0(px)?$/.test(bottom) && (zIndex(r.body) > TAB_BAR_Z || r.selector.includes("hud-v2-compact")));
  });

describe("phone tab bar reservation", () => {
  it("finds the bottom-docked rules (the scan itself works)", () => {
    expect(bottomDocked.map(keyOf)).toContain("client-placement-overlay-style.css :: #placement-overlay");
  });

  it.each(bottomDocked.map((r) => [keyOf(r), r] as const))("%s keeps clear of the tab bar", (key, rule) => {
    const verdict = VERDICTS[key];
    expect(verdict, `${key} is docked to the bottom (bottom: ${declared(rule.body, "bottom")}) and would sit on the phone tab bar. ` +
      "Add a body.hud-v2-compact rule ending above it (bottom: calc(var(--v2c-bottom) + …)) or replacing it, then list it in VERDICTS.").toBeDefined();
    if (verdict!.kind === "above") expect(zIndex(rule.body)).toBeGreaterThan(TAB_BAR_Z);
    if (verdict!.kind === "lifted") expect(lifted(verdict!.token), `no compact rule lifts ${verdict!.token} over the tab bar`).toBe(true);
  });

  it("has no stale entries", () => {
    const live = new Set(bottomDocked.map(keyOf));
    expect(Object.keys(VERDICTS).filter((key) => !live.has(key))).toEqual([]);
  });
});

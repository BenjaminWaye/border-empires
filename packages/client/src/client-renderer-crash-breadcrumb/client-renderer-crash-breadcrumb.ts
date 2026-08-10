// A hard browser crash runs no JavaScript. No catch block fires, no
// `webglcontextlost` listener fires, nothing gets written on the way down —
// so the failure paths in client-three-renderer-host.ts, which handle a
// renderer that *throws* or *loses its context*, cannot see it at all. A tab
// killed for exceeding its memory allowance simply stops existing.
//
// The only way to learn anything about a crash like that is to write down
// what you were about to do *before* doing it, and read it back on the next
// load. That's this module: a breadcrumb recording how far the 3D renderer
// got, persisted to localStorage the way client-connection-diagnostics.ts
// persists disconnects, and reported in the diagnostics bundle.
//
// Reading the breadcrumb after a crash tells you which phase died:
//   "init-started"   — the tab died while allocating the renderer's buffers.
//                      That is the memory-exhaustion signature.
//   "init-completed" — allocation survived; it died while rendering frames.
//   "survived"       — 3D ran for SURVIVAL_MS without dying. Not a crash.
//
// The consecutive-crash count is also what lets the app stop doing this to a
// player: after CRASH_ATTEMPTS_BEFORE_2D failed attempts, 3D is skipped and
// the game comes up in 2D rather than crash-looping.

import { storageGet, storageSet } from "../client-state/client-state.js";

const BREADCRUMB_STORAGE_KEY = "border-empires-renderer-breadcrumb-v1";

// How long 3D must survive before the attempt counts as healthy. Long enough
// to cover buffer allocation, shader compilation, and the first frames — the
// window a memory kill would land in — without making a player who quits
// early look like a crash.
const SURVIVAL_MS = 8000;

// One bad attempt can be a fluke (a backgrounded tab, an unrelated OS kill).
// Two in a row is a device that cannot run this renderer.
export const CRASH_ATTEMPTS_BEFORE_2D = 2;

export type RendererAttemptPhase = "init-started" | "init-completed" | "survived";

export type RendererBreadcrumb = {
  readonly atMs: number;
  readonly phase: RendererAttemptPhase;
  readonly tileBudget: number;
  // Consecutive attempts that never reached "survived". Reset by a healthy run.
  readonly failedAttempts: number;
  readonly userAgent?: string | undefined;
};

const readBreadcrumb = (): RendererBreadcrumb | undefined => {
  const raw = storageGet(BREADCRUMB_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const value = parsed as Partial<RendererBreadcrumb>;
    if (typeof value.phase !== "string" || typeof value.atMs !== "number") return undefined;
    return {
      atMs: value.atMs,
      phase: value.phase as RendererAttemptPhase,
      tileBudget: typeof value.tileBudget === "number" ? value.tileBudget : 0,
      failedAttempts: typeof value.failedAttempts === "number" ? value.failedAttempts : 0,
      userAgent: value.userAgent
    };
  } catch {
    return undefined;
  }
};

const writeBreadcrumb = (breadcrumb: RendererBreadcrumb): void => {
  storageSet(BREADCRUMB_STORAGE_KEY, JSON.stringify(breadcrumb));
};

// Snapshotted at module load, before this session writes its own breadcrumb,
// so the diagnostics bundle can still report what the *previous* session did
// however late it is read.
const previousAttempt = readBreadcrumb();

/** What the previous session's 3D attempt reached, if there was one. */
export const previousRendererAttempt = (): RendererBreadcrumb | undefined => previousAttempt;

/**
 * True when the last attempts died before reaching "survived" often enough
 * that 3D should not be attempted again. This is the crash-loop brake: a
 * device that hard-crashes gets a working 2D game instead of a dead tab.
 */
export const shouldSkipThreeDAfterCrashes = (): boolean =>
  previousAttempt !== undefined &&
  previousAttempt.phase !== "survived" &&
  previousAttempt.failedAttempts >= CRASH_ATTEMPTS_BEFORE_2D;

let attemptTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Records that a 3D renderer attempt is starting, *before* any allocation.
 * Call this immediately before constructing the renderer — the whole point is
 * that it is already on disk if the tab dies mid-construction.
 */
export const beginRendererAttempt = (tileBudget: number): void => {
  writeBreadcrumb({
    atMs: Date.now(),
    phase: "init-started",
    tileBudget,
    // Counts this attempt: if the tab dies now, the next load sees it.
    failedAttempts: (previousAttempt?.failedAttempts ?? 0) + 1,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined
  });
};

/** Records that construction returned without crashing the tab. */
export const markRendererInitCompleted = (tileBudget: number): void => {
  const current = readBreadcrumb();
  writeBreadcrumb({
    atMs: Date.now(),
    phase: "init-completed",
    tileBudget,
    failedAttempts: current?.failedAttempts ?? 1,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined
  });

  // Surviving the danger window clears the failure streak, so one bad day
  // doesn't strand a working device in 2D forever.
  if (attemptTimer !== undefined) clearTimeout(attemptTimer);
  attemptTimer = setTimeout(() => {
    writeBreadcrumb({
      atMs: Date.now(),
      phase: "survived",
      tileBudget,
      failedAttempts: 0,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined
    });
  }, SURVIVAL_MS);
};

/** Records that 3D was abandoned through a handled path, not a crash. */
export const markRendererAttemptHandled = (): void => {
  if (attemptTimer !== undefined) clearTimeout(attemptTimer);
  attemptTimer = undefined;
  const current = readBreadcrumb();
  if (!current) return;
  // A caught failure is not a crash — it must not push the device toward the
  // crash-loop brake, which exists for deaths nothing can catch.
  writeBreadcrumb({ ...current, phase: "survived", failedAttempts: 0 });
};

/** Test-only: drops the persisted breadcrumb and any pending survival timer. */
export const resetRendererBreadcrumbForTest = (): void => {
  if (attemptTimer !== undefined) clearTimeout(attemptTimer);
  attemptTimer = undefined;
  storageSet(BREADCRUMB_STORAGE_KEY, "");
};

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
//   "init-started"        — the tab died while allocating the renderer's
//                            buffers. That is the memory-exhaustion signature.
//   "init-completed"      — allocation survived; it died before the first
//                            terrain rebuild even started (or, on an older
//                            build without that marker, anywhere after).
//   "first-render-started" — allocation survived, and it died during the
//                            first rebuildVisibleTerrain() pass: the
//                            heightfield mesh + per-tile overlay population +
//                            ~25 overlay .commit() calls for the whole
//                            initial tile budget, all synchronous, all before
//                            a single frame has been drawn. This is a second,
//                            distinct memory-exhaustion signature from
//                            "init-started" — the preallocated buffers fit,
//                            but populating them for the first time didn't.
//   "survived"             — 3D ran for SURVIVAL_MS without dying. Not a crash.
//
// The consecutive-crash count is also what lets the app stop doing this to a
// player: after CRASH_ATTEMPTS_BEFORE_2D failed attempts, 3D is skipped and
// the game comes up in 2D rather than crash-looping.
//
// The above covers a crash during startup. It says nothing about the report
// this module was missing: a session that ran fine for a while (long past
// SURVIVAL_MS, "survived" already recorded) and then died later — the actual
// iOS Safari shape, where memory pressure builds up over a play session and
// the tab is jetsam-killed minutes in, not seconds. To catch that, the
// renderer host pings `recordRendererHeartbeat` on an interval for as long as
// it's alive. That leaves `lastHeartbeatAtMs` on disk: if the next load finds
// a heartbeat with no matching `cleanShutdownAtMs` (written on `pagehide`),
// the gap between them is roughly how long ago the tab actually died, which a
// hard crash otherwise leaves no trace of at all.

import { storageGet, storageRemove, storageSet } from "../client-state/client-state.js";

const BREADCRUMB_STORAGE_KEY = "border-empires-renderer-breadcrumb-v1";

// How long 3D must survive before the attempt counts as healthy. Long enough
// to cover buffer allocation, shader compilation, and the first frames — the
// window a memory kill would land in — without making a player who quits
// early look like a crash.
const SURVIVAL_MS = 8000;

// One bad attempt can be a fluke (a backgrounded tab, an unrelated OS kill).
//
// This was 2, on the reasoning that two in a row is a device that cannot run
// this renderer. That was true when every attempt was identical — but the
// degradation ladder (client-map-3d-quality-tier.ts) now spends the streak
// walking down a rung at a time: `failedAttempts` 0 is full quality, 1 is
// reduced, 2 is minimum. Stopping at 2 retired 3D one attempt *before* the
// cheapest configuration was ever tried, which is the shape an iPhone reported
// (two identical full-quality deaths, then 2D forever). 3 is what it costs to
// give each rung exactly one attempt; only a device that also dies at the
// bottom is one that genuinely cannot run this renderer.
const CRASH_ATTEMPTS_BEFORE_2D = 3;

export type RendererAttemptPhase = "init-started" | "init-completed" | "first-render-started" | "survived";

export type RendererBreadcrumb = {
  readonly atMs: number;
  readonly phase: RendererAttemptPhase;
  readonly tileBudget: number;
  // Consecutive attempts that never reached "survived". Reset by a healthy run.
  readonly failedAttempts: number;
  readonly userAgent?: string | undefined;
  // Last time recordRendererHeartbeat() ran, and how many times it has. Set
  // once 3D is alive and updated on an interval for as long as it stays
  // alive — see the module comment above.
  readonly lastHeartbeatAtMs?: number | undefined;
  readonly heartbeatCount?: number | undefined;
  // Written by a `pagehide` listener when the tab goes away through a normal
  // path (navigation, reload, closed tab) rather than being killed outright.
  // Its absence — or staleness relative to lastHeartbeatAtMs — is the
  // positive signal that the previous session ended in a hard crash.
  readonly cleanShutdownAtMs?: number | undefined;
  // What three.js's own `renderer.info` reported right after construction
  // succeeded — see recordRendererGpuStats below. Present only when the
  // attempt got at least as far as markRendererInitCompleted.
  readonly gpuGeometries?: number | undefined;
  readonly gpuTextures?: number | undefined;
  readonly gpuPrograms?: number | undefined;
};

/** What `renderer.info` reports right after construction. Counts, not bytes —
 * three.js doesn't track byte sizes — but a live count is still the
 * difference between guessing at allocation size from outside the renderer
 * and reading what it actually built. */
export type RendererGpuStats = {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
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
      userAgent: value.userAgent,
      lastHeartbeatAtMs: typeof value.lastHeartbeatAtMs === "number" ? value.lastHeartbeatAtMs : undefined,
      heartbeatCount: typeof value.heartbeatCount === "number" ? value.heartbeatCount : undefined,
      cleanShutdownAtMs: typeof value.cleanShutdownAtMs === "number" ? value.cleanShutdownAtMs : undefined,
      gpuGeometries: typeof value.gpuGeometries === "number" ? value.gpuGeometries : undefined,
      gpuTextures: typeof value.gpuTextures === "number" ? value.gpuTextures : undefined,
      gpuPrograms: typeof value.gpuPrograms === "number" ? value.gpuPrograms : undefined
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

/**
 * Wipes the breadcrumb entirely, so the next load starts with a clean streak
 * instead of reading the brake above as tripped. This is the escape hatch for
 * a false-positive brake: a player who reloaded mid-construction (closing the
 * tab, hitting refresh) leaves the same "died before init-completed" shape on
 * disk as a real hard crash, and `shouldSkipThreeDAfterCrashes` cannot tell
 * the two apart. The "Try 3D again" button on the fallback notice calls this
 * before reloading, so a spurious brake trip isn't permanent.
 *
 * Deliberately a full removal rather than zeroing `failedAttempts` in place:
 * `previousAttempt` is only snapshotted at module load, so within *this*
 * session `shouldSkipThreeDAfterCrashes()` would keep reading the old value
 * either way — the removal is for the reload this is always paired with.
 */
export const clearRendererCrashStreak = (): void => {
  storageRemove(BREADCRUMB_STORAGE_KEY);
};

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

/**
 * Records that the *first* rebuildVisibleTerrain() pass is about to run —
 * the synchronous heightfield/overlay build for the whole initial tile
 * budget, which is real allocation-adjacent work that happens after
 * `markRendererInitCompleted` already wrote "init-completed". Call this only
 * for the first rebuild of a session; later rebuilds are already covered by
 * the heartbeat once 3D is confirmed alive.
 */
export const markRendererFirstRenderStarted = (): void => {
  const current = readBreadcrumb();
  if (!current) return;
  writeBreadcrumb({ ...current, atMs: Date.now(), phase: "first-render-started" });
};

/** Records that the first rebuild above returned without crashing the tab. */
export const markRendererFirstRenderCompleted = (): void => {
  const current = readBreadcrumb();
  if (!current) return;
  writeBreadcrumb({ ...current, atMs: Date.now(), phase: "init-completed" });
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

/**
 * Pings that 3D is still alive. Call this on an interval for as long as the
 * renderer is up — not just once past SURVIVAL_MS — so a death long after
 * startup (the iOS memory-pressure shape) still leaves a recent timestamp
 * behind. Deliberately leaves `phase`/`failedAttempts` untouched: the
 * crash-loop brake only cares about startup deaths, not this.
 */
export const recordRendererHeartbeat = (tileBudget: number): void => {
  const current = readBreadcrumb();
  if (!current) return;
  writeBreadcrumb({
    ...current,
    tileBudget,
    lastHeartbeatAtMs: Date.now(),
    heartbeatCount: (current.heartbeatCount ?? 0) + 1
  });
};

/**
 * Records what three.js's own `renderer.info` reported right after
 * construction succeeded. Call once, right after `markRendererInitCompleted`.
 *
 * This exists because every other number in this module — tile budget, pixel
 * ratio, MSAA on/off — is something *we* chose going in. None of them says
 * what the renderer actually built. On a device we can't reach directly (an
 * iOS user reporting a crash, with no way to attach Safari Web Inspector),
 * this is the only real allocation data that ever reaches us: it rides along
 * in the same diagnostics bundle the crash breadcrumb already feeds, so the
 * next affected session's report carries actual GPU resource counts instead
 * of an estimate made from outside the renderer.
 */
export const recordRendererGpuStats = (stats: RendererGpuStats): void => {
  const current = readBreadcrumb();
  if (!current) return;
  writeBreadcrumb({
    ...current,
    gpuGeometries: stats.geometries,
    gpuTextures: stats.textures,
    gpuPrograms: stats.programs
  });
};

/**
 * True when the previous session has a heartbeat with no matching clean
 * shutdown — i.e. it was still alive and then just stopped, which is what a
 * hard crash (tab jetsam-killed, no JS runs on the way down) looks like from
 * here. A session that never started 3D, or that shut down normally, reads
 * false.
 */
export const previousSessionEndedUncleanly = (): boolean => {
  if (!previousAttempt?.lastHeartbeatAtMs) return false;
  return (
    previousAttempt.cleanShutdownAtMs === undefined ||
    previousAttempt.cleanShutdownAtMs < previousAttempt.lastHeartbeatAtMs
  );
};

// Best-effort: iOS Safari fires `pagehide` for an ordinary navigation, reload,
// or tab close, but not for a jetsam kill — which is exactly the asymmetry
// previousSessionEndedUncleanly() above reads. Registered unconditionally at
// module load rather than only while 3D is active, since a shutdown while 2D
// is showing (post-fallback) is still worth recording as clean.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    const current = readBreadcrumb();
    if (!current) return;
    writeBreadcrumb({ ...current, cleanShutdownAtMs: Date.now() });
  });
}

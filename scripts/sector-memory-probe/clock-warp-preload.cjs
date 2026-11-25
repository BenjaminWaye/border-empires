// Preload (NODE_OPTIONS="--require <this file>") that runs the whole stack on
// a faster or shifted wall clock, so a world can be aged past what a real-time
// run reaches. Local measurement only; never loaded in a deployed process.
//
//   PROBE_CLOCK_SCALE=8   Date runs 8x real time and every timer delay is
//                         divided by 8, in every thread of the process.
//   PROBE_CLOCK_RESUME=1  Start from the last time recorded in
//                         PROBE_DIR/clock.json instead of the real time, so a
//                         world aged at 8x can be restarted at 1x without its
//                         timestamps lying in the future.
//
// With neither set this file changes nothing.
//
// What it does not change: performance.now(), process.hrtime(), event-loop
// delay monitors, CPU time and SQLite's own clock stay real. So at 8x the game
// rules see 8 game seconds per real second, but a handler that takes 5 ms
// still takes 5 ms -- the server has an eighth of the real time per game
// second to do the same work. Rates per real second (CPU, events, bytes) from
// a scaled run are therefore not production rates; state-driven figures (heap,
// what the world contains) are the point of it.
//
// The main thread writes PROBE_DIR/clock.json once a real second so clients
// can mint tokens against the stack's clock and a later run can resume it.
const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const path = require("node:path");
const { isMainThread } = require("node:worker_threads");

const scale = Math.max(1, Number(process.env.PROBE_CLOCK_SCALE ?? 1) || 1);
const resume = process.env.PROBE_CLOCK_RESUME === "1";
const dir = process.env.PROBE_DIR;

if (scale > 1 || resume) {
  const RealDate = Date;
  const realSetInterval = setInterval;
  // Every thread must share one origin. The main thread fixes it and hands it
  // to workers through the environment they inherit at spawn.
  if (isMainThread && !process.env.PROBE_CLOCK_BASE_REAL) {
    let baseWarped = RealDate.now();
    if (resume && dir) {
      try {
        baseWarped = Math.max(baseWarped, JSON.parse(readFileSync(path.join(dir, "clock.json"), "utf8")).warpedMs);
      } catch {
        // no earlier run to resume: start from the real time
      }
    }
    process.env.PROBE_CLOCK_BASE_REAL = String(RealDate.now());
    process.env.PROBE_CLOCK_BASE_WARPED = String(baseWarped);
  }
  const baseReal = Number(process.env.PROBE_CLOCK_BASE_REAL);
  const baseWarped = Number(process.env.PROBE_CLOCK_BASE_WARPED);
  const now = () => Math.floor(baseWarped + (RealDate.now() - baseReal) * scale);

  function WarpedDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return Reflect.construct(RealDate, args.length === 0 ? [now()] : args, new.target);
  }
  WarpedDate.prototype = RealDate.prototype;
  WarpedDate.now = now;
  WarpedDate.parse = RealDate.parse;
  WarpedDate.UTC = RealDate.UTC;
  RealDate.prototype.constructor = WarpedDate;
  globalThis.Date = WarpedDate;

  if (scale > 1) {
    const shrink = (delay) => {
      const ms = Number(delay);
      return ms > 0 ? Math.max(1, ms / scale) : delay;
    };
    const timers = require("node:timers");
    const timersPromises = require("node:timers/promises");
    const util = require("node:util");
    const wrap = (original) => {
      const wrapped = (callback, delay, ...args) => original(callback, shrink(delay), ...args);
      return wrapped;
    };
    const promiseTimeout = timersPromises.setTimeout;
    const promiseInterval = timersPromises.setInterval;
    timersPromises.setTimeout = (delay, ...rest) => promiseTimeout(shrink(delay), ...rest);
    timersPromises.setInterval = (delay, ...rest) => promiseInterval(shrink(delay), ...rest);
    if (timersPromises.scheduler?.wait) {
      const wait = timersPromises.scheduler.wait.bind(timersPromises.scheduler);
      timersPromises.scheduler.wait = (delay, ...rest) => wait(shrink(delay), ...rest);
    }
    const warpedSetTimeout = wrap(timers.setTimeout);
    warpedSetTimeout[util.promisify.custom] = timersPromises.setTimeout;
    timers.setTimeout = warpedSetTimeout;
    timers.setInterval = wrap(timers.setInterval);
    globalThis.setTimeout = timers.setTimeout;
    globalThis.setInterval = timers.setInterval;
    const abortTimeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (delay) => abortTimeout(shrink(delay));
    require("node:module").syncBuiltinESMExports();
  }

  if (isMainThread && dir) {
    const file = path.join(dir, "clock.json");
    const write = () => {
      try {
        writeFileSync(`${file}.tmp`, JSON.stringify({ realMs: RealDate.now(), warpedMs: now(), scale }));
        renameSync(`${file}.tmp`, file);
      } catch {
        // measurement must never take the stack down
      }
    };
    write();
    process.on("exit", write);
    realSetInterval(write, 1000).unref();
  }
}

// Death forensics — persisted to the /data mounted volume on both kill paths
// (watchdog SIGKILL and sim-worker non-zero exit) so the cause survives the
// restart that previously scrolled it out of the ephemeral flyctl log buffer.
// On next boot `replayDeathForensicsOnBoot` logs the prior death and appends
// it to a bounded five-entry history.
//
// NOTE: the watchdog's own writer lives inside a stringified Worker source
// (event-loop-watchdog.ts) and cannot import this module — it only consumes
// DEATH_FORENSICS_PATH, passed in as an option. This module is the single
// source of truth for that path so the two writers can never drift.
import fs from "node:fs";

export const DEATH_FORENSICS_PATH =
  typeof process.env.DEATH_FORENSICS_PATH === "string" && process.env.DEATH_FORENSICS_PATH.trim().length > 0
    ? process.env.DEATH_FORENSICS_PATH.trim()
    : "/data/.death-forensics.json";

/** Best-effort synchronous write of a forensics blob before the process dies. */
export const writeDeathForensics = (blob: Record<string, unknown>): void => {
  try {
    fs.writeFileSync(DEATH_FORENSICS_PATH, JSON.stringify(blob), "utf8");
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({
        level: 50,
        time: Date.now(),
        msg: "death_forensics_write_failed",
        path: DEATH_FORENSICS_PATH,
        error: err instanceof Error ? err.message : String(err)
      })}\n`
    );
  }
};

const MAX_DEATH_FORENSICS_HISTORY = 5;

/** Log a prior death and retain a bounded history across later restarts. */
export const replayDeathForensicsOnBoot = (filePath = DEATH_FORENSICS_PATH): void => {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const historyPath = `${filePath}.history.json`;
    const previous: unknown = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : [];
    const history = Array.isArray(previous) ? previous : [];
    const evicted = Math.max(0, history.length + 1 - MAX_DEATH_FORENSICS_HISTORY);
    const nextHistory = [...history, parsed].slice(-MAX_DEATH_FORENSICS_HISTORY);
    const temporaryPath = `${historyPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(nextHistory), "utf8");
    fs.renameSync(temporaryPath, historyPath);
    process.stderr.write(
      `${JSON.stringify({
        level: 50,
        time: Date.now(),
        msg: "previous_death_forensics",
        forensics: parsed,
        historyEvicted: evicted
      })}\n`
    );
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort — don't block boot on a missing or corrupted forensics file.
  }
};

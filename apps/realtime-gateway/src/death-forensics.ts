// Death forensics — persisted to the /data mounted volume on both kill paths
// (watchdog SIGKILL and sim-worker non-zero exit) so the cause survives the
// restart that previously scrolled it out of the ephemeral flyctl log buffer.
// On next boot `replayDeathForensicsOnBoot` logs the prior death and rotates
// the file to `.prev`.
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

/** If forensics from a prior death exist, log them and rotate to `.prev`. */
export const replayDeathForensicsOnBoot = (): void => {
  try {
    if (!fs.existsSync(DEATH_FORENSICS_PATH)) return;
    const raw = fs.readFileSync(DEATH_FORENSICS_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    process.stderr.write(
      `${JSON.stringify({
        level: 50,
        time: Date.now(),
        msg: "previous_death_forensics",
        forensics: parsed
      })}\n`
    );
    fs.renameSync(DEATH_FORENSICS_PATH, `${DEATH_FORENSICS_PATH}.prev`);
  } catch {
    // Best-effort — don't block boot on a missing or corrupted forensics file.
  }
};

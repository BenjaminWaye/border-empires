import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replayDeathForensicsOnBoot } from "./death-forensics.js";

const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("replayDeathForensicsOnBoot", () => {
  it("keeps the last five deaths instead of losing the original stall on the next restart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "be-death-forensics-"));
    createdDirs.push(dir);
    const filePath = path.join(dir, "death.json");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    for (let id = 1; id <= 6; id += 1) {
      fs.writeFileSync(filePath, JSON.stringify({ id, deathKind: id === 1 ? "watchdog_kill" : "sim_worker_exit" }));
      replayDeathForensicsOnBoot(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    }

    const history = JSON.parse(fs.readFileSync(`${filePath}.history.json`, "utf8")) as Array<{ id: number }>;
    expect(history.map((entry) => entry.id)).toEqual([2, 3, 4, 5, 6]);
    expect(fs.statSync(`${filePath}.history.json`).size).toBeLessThan(1_000);
  });
});

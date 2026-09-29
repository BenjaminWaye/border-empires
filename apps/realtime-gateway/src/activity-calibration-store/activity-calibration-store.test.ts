import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqliteGatewayActivityCalibrationStore } from "./activity-calibration-store.js";

type DatabaseSyncCtor = new (path: string) => { prepare(sql: string): { run(...values: unknown[]): void } };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

const state = {
  activityTimelinePayloadBytes: [100], activityTimelineCardCount: [2], activityTimelineTruncatedTotal: 1,
  activityApiPayloadBytes: [200], worldPulsePayloadBytes: [300]
};

describe("SqliteGatewayActivityCalibrationStore", () => {
  it("round-trips one bounded calibration state", async () => {
    const store = new SqliteGatewayActivityCalibrationStore(new DatabaseSync(":memory:"));
    await store.applySchema();
    await store.save(state);
    expect(await store.load()).toEqual(state);
  });

  it("ignores a corrupt persisted state", async () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewayActivityCalibrationStore(db);
    await store.applySchema();
    db.prepare("INSERT INTO gateway_activity_calibration (singleton_key, state_json, updated_at) VALUES ('current', ?, 0)")
      .run('{"activityTimelinePayloadBytes":"not-an-array"}');
    expect(await store.load()).toBeUndefined();
  });
});

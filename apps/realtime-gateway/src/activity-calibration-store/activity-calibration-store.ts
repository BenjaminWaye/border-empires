import type { DatabaseSync } from "node:sqlite";

import type { GatewayActivityCalibrationState } from "../metrics/metrics.js";

type CalibrationRow = { state_json: string };

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isNonNegativeNumber);

const isCalibrationState = (value: unknown): value is GatewayActivityCalibrationState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GatewayActivityCalibrationState>;
  return (
    isNumberArray(candidate.activityTimelinePayloadBytes) &&
    isNumberArray(candidate.activityTimelineCardCount) &&
    isNonNegativeNumber(candidate.activityTimelineTruncatedTotal) &&
    isNumberArray(candidate.activityApiPayloadBytes) &&
    isNumberArray(candidate.worldPulsePayloadBytes)
  );
};

export type GatewayActivityCalibrationStore = {
  load: () => Promise<GatewayActivityCalibrationState | undefined>;
  save: (state: GatewayActivityCalibrationState) => Promise<void>;
};

export class SqliteGatewayActivityCalibrationStore implements GatewayActivityCalibrationStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gateway_activity_calibration (
        singleton_key TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  async load(): Promise<GatewayActivityCalibrationState | undefined> {
    const row = this.db
      .prepare("SELECT state_json FROM gateway_activity_calibration WHERE singleton_key = 'current' LIMIT 1")
      .get() as CalibrationRow | undefined;
    if (!row) return undefined;
    try {
      const parsed: unknown = JSON.parse(row.state_json);
      return isCalibrationState(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async save(state: GatewayActivityCalibrationState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO gateway_activity_calibration (singleton_key, state_json, updated_at)
         VALUES ('current', ?, ?)
         ON CONFLICT(singleton_key) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(state), Date.now());
  }
}

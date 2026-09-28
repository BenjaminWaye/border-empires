import type { GatewayActivityCalibrationStore } from "./activity-calibration-store.js";

type CreateGatewayActivityCalibrationStoreOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayActivityCalibrationStore = async (
  options: CreateGatewayActivityCalibrationStoreOptions
): Promise<GatewayActivityCalibrationStore | undefined> => {
  if (!options.sqlitePath) return undefined;
  const [{ SqliteGatewayActivityCalibrationStore }, { openSqliteDatabase }] = await Promise.all([
    import("./activity-calibration-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGatewayActivityCalibrationStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};

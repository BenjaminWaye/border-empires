/** How long a called-down AFC module is in transit before it docks. */
export const AFC_MODULE_CALL_DOWN_MS = 60_000;

/** Module bays on one AFC (the 8 sockets of its socket ring). */
export const AFC_MODULE_BAY_COUNT = 8;

/** Bays in use: every docked copy (House or captured) plus every module in transit to it. */
export const afcModuleBaysUsed = (afc: { modules?: readonly string[] | undefined; incomingModules?: readonly unknown[] | undefined }): number =>
  (afc.modules?.length ?? 0) + (afc.incomingModules?.length ?? 0);

/** Free bays left on an AFC, never negative (pre-cap saves can hold more than 8). */
export const afcModuleBaysFree = (afc: Parameters<typeof afcModuleBaysUsed>[0]): number =>
  Math.max(0, AFC_MODULE_BAY_COUNT - afcModuleBaysUsed(afc));

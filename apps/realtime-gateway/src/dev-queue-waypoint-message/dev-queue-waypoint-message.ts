// Payload extraction for the six dev/waypoint-queue message types (see
// runtime-dev-queue.ts / runtime-waypoint-queue.ts on the simulation side),
// pulled out of gateway-app.ts's already-oversized dispatch chain so wiring
// these up doesn't add to that file's line count -- see check-file-line-limits.mjs.
export const DEV_QUEUE_WAYPOINT_MESSAGE_TYPES = [
  "DEV_QUEUE_ENQUEUE",
  "DEV_QUEUE_CANCEL",
  "DEV_QUEUE_MOVE_TO_FRONT",
  "WAYPOINT_ENQUEUE",
  "WAYPOINT_CANCEL",
  "WAYPOINT_CANCEL_ALL"
] as const;

export type DevQueueWaypointMessageType = (typeof DEV_QUEUE_WAYPOINT_MESSAGE_TYPES)[number];

const devQueueWaypointMessageTypeSet: ReadonlySet<string> = new Set(DEV_QUEUE_WAYPOINT_MESSAGE_TYPES);

export const isDevQueueWaypointMessageType = (type: string): type is DevQueueWaypointMessageType =>
  devQueueWaypointMessageTypeSet.has(type);

/** Every one of these six message shapes is just its durable-command payload plus a `type` tag -- strip it. */
export const devQueueWaypointCommandPayload = (message: Record<string, unknown> & { type: string }): Record<string, unknown> => {
  const { type: _type, ...payload } = message;
  return payload;
};

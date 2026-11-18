// Capturing a tile that holds another empire's muster flag takes the troops
// staged on it: the captor gains the flag's manpower (up to their manpower
// ceiling) and the flag's owner loses it. These are the per-player messages
// the simulation sends both sides so the map can show what changed hands
// (apps/simulation/src/muster-capture/muster-capture.ts).

export const MUSTER_CAPTURED_MESSAGE_TYPE = "MUSTER_CAPTURED";
export const MUSTER_LOST_MESSAGE_TYPE = "MUSTER_LOST";

/** Sent to the captor. `amount` was staged on the flag; `gained` is what fit under their ceiling. */
export type MusterCapturedPayload = {
  type: typeof MUSTER_CAPTURED_MESSAGE_TYPE;
  x: number;
  y: number;
  amount: number;
  gained: number;
  fromPlayerId: string;
};

/** Sent to the flag's owner. */
export type MusterLostPayload = {
  type: typeof MUSTER_LOST_MESSAGE_TYPE;
  x: number;
  y: number;
  amount: number;
  byPlayerId: string;
};

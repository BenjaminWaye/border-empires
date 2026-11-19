// Private loss warning: when one of your kept House Charges stops being held,
// you (and only you; the attacker is never told) get an alert with Show on map.
// The simulation records when it was lost (`lostAt`), so a House that was
// offline still hears about it on its next connect. Warnings already shown are
// remembered per deal in localStorage, so a reconnect does not repeat them.
import type { HouseChargesPayload } from "@border-empires/shared";
import { pushFeedEntry, type FeedMutableState } from "../client-alerts/client-alerts.js";
import { houseChargeFocusPoint } from "./client-house-charges-panel.js";

const STORAGE_KEY = "be.houseCharges.lossesSeen";

type SeenLosses = { dealtAt: number; keys: string[] };

const readSeen = (dealtAt: number): Set<string> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SeenLosses) : undefined;
    return parsed && parsed.dealtAt === dealtAt && Array.isArray(parsed.keys) ? new Set(parsed.keys) : new Set();
  } catch {
    return new Set();
  }
};

const writeSeen = (dealtAt: number, keys: Set<string>): void => {
  try {
    // Bounded: only the current deal's losses, at most a few per charge.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dealtAt, keys: [...keys].slice(-50) }));
  } catch {
    // Storage blocked: the warning may repeat on reconnect, which is harmless.
  }
};

/** Pushes one alert per newly lost kept charge. Returns how many were announced. */
export const announceHouseChargeLosses = (state: FeedMutableState, payload: HouseChargesPayload | undefined): number => {
  if (!payload) return 0;
  const seen = readSeen(payload.dealtAt);
  let announced = 0;
  for (const charge of payload.charges) {
    if (!charge.kept || charge.held || charge.lostAt === undefined) continue;
    const key = `${charge.id}@${charge.lostAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const point = houseChargeFocusPoint(charge);
    pushFeedEntry(state, {
      title: "House charge lost",
      text: `${charge.title} is no longer held. It only counts if you hold it again when this Sector Contest's winner is crowned.`,
      type: "mission",
      severity: "warn",
      at: charge.lostAt,
      focusX: point.x,
      focusY: point.y,
      actionLabel: "Show on map"
    });
    announced += 1;
  }
  if (announced > 0) writeSeen(payload.dealtAt, seen);
  return announced;
};

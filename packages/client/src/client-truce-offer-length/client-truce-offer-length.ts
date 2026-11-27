// The truce an incoming offer actually gives. A new truce's clock starts when it
// is offered (offeredTruceEndsAt), so a 24h offer accepted 2h later runs 22h;
// playtest 2026-11-27: "my 24h truce ran as an 11h one" because the accept
// button and the confirmation only ever said "truce". Whole hours, or minutes
// under an hour. Extensions add their own hours to the running truce.
import { offeredTruceEndsAt } from "../client-diplomacy-trade/client-treaty-requests.js";
import type { ActiveTruceView, TruceRequest } from "../client-types.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** "22h" (nearest hour) or "40m" under an hour. */
export const truceLengthLabel = (remainingMs: number): string => {
  const minutes = Math.max(1, Math.ceil(remainingMs / MINUTE_MS));
  return minutes < 60 ? `${minutes}m` : `${Math.round(remainingMs / HOUR_MS)}h`;
};

/** The length a new truce would have if accepted at `nowMs`; undefined for an extension offer. */
export const offeredTruceLength = (request: Pick<TruceRequest, "createdAt" | "durationHours" | "extendsTruce">, nowMs: number): string | undefined => {
  const endsAt = offeredTruceEndsAt(request);
  return endsAt === undefined ? undefined : truceLengthLabel(endsAt - nowMs);
};

/** "Accept 22h truce"; plain "Accept" for an extension (its row says the hours it adds). */
export const acceptTruceLabel = (length: string | undefined, verb = "Accept"): string => (length ? `${verb} ${length} truce` : verb);

/** The popup line once a truce is agreed or extended: "Truce with House X · 22h". */
export const truceAgreedLine = (truce: Pick<ActiveTruceView, "otherPlayerName" | "endsAt">, nowMs: number): string =>
  `Truce with ${truce.otherPlayerName} · ${truceLengthLabel(truce.endsAt - nowMs)}`;

/**
 * Negotiated truces that an update started or extended: new partners, or a later end than before.
 * A Court armistice is imposed, not agreed, so it is left out.
 */
export const agreedTruces = (before: readonly ActiveTruceView[], after: readonly ActiveTruceView[]): Array<ActiveTruceView & { extended: boolean }> => {
  const previousEnd = new Map(before.map((truce) => [truce.otherPlayerId, truce.endsAt]));
  return after
    .filter((truce) => truce.origin !== "court")
    .flatMap((truce) => {
      const was = previousEnd.get(truce.otherPlayerId);
      if (was !== undefined && truce.endsAt <= was) return [];
      return [{ ...truce, extended: was !== undefined }];
    });
};

import { rallyLinkIsActive, type RallyAnchor, type RallyLinkStore } from "./rally-link-store.js";

export type RallyAuthChannel = "control" | "bulk" | "recovery";

export type RallyAuthReservation = {
  accepted: boolean;
  code?: string;
  anchor?: RallyAnchor;
};

export type RallyAuthReservationDeps = {
  rallyLinkStore: RallyLinkStore;
  activeOwnerAnchor: (ownerPlayerId: string) => Promise<RallyAnchor | undefined>;
  seasonIsActive: () => Promise<boolean>;
  now?: () => number;
};

export const reserveRallyLinkForAuth = async (
  rallyCode: string | undefined,
  channel: RallyAuthChannel,
  deps: RallyAuthReservationDeps
): Promise<RallyAuthReservation> => {
  if (!rallyCode || channel !== "control") return { accepted: false };
  const now = deps.now?.() ?? Date.now();
  const link = await deps.rallyLinkStore.get(rallyCode);
  if (!link || !rallyLinkIsActive(link, now) || !(await deps.seasonIsActive())) return { accepted: false };
  if (!(await deps.activeOwnerAnchor(link.ownerPlayerId))) return { accepted: false };
  const reservedLink = await deps.rallyLinkStore.consume(link.code, deps.now?.() ?? Date.now());
  return reservedLink ? { accepted: true, code: reservedLink.code, anchor: reservedLink.anchor } : { accepted: false };
};

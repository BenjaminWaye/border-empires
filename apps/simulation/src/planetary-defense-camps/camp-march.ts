// Insurgent (Planetary Defense) companies march out from their camp
// (docs/planetary-defense-camps-plan.md, "Camps march"). Every ATTACK and
// EXPAND a camp launches is charged the walk from the camp tile to the tile it
// launches from, the same route and per-tile rate a House's muster company
// pays (muster-transit-delay.ts): the lock resolves that much later, which
// slows a camp spread over many tiles, and the camp's rest still counts from
// when the action settles.
//
// Insurgent commands are not automation, so nobody else is told about the
// march by COMMAND_ACCEPTED (it goes to the barbarian player alone) and an
// EXPAND into neutral land raises no ATTACK_ALERT. So that players can watch
// the soldiers walk, every human with the game open who can see the camp,
// the launch tile or the target gets an INSURGENT_MARCH message
// (client-insurgent-march/ draws it in both renderers).
import type { DomainTileState } from "@border-empires/game-domain";
import type { MusterTransitRoute, TransitPoint } from "@border-empires/shared";

export const INSURGENT_MARCH_MESSAGE_TYPE = "INSURGENT_MARCH";

export type CampMarch = {
  commandId: string;
  actionType: "ATTACK" | "EXPAND";
  camp: TransitPoint;
  from: TransitPoint;
  to: TransitPoint;
  /**
   * The route the march was timed on (muster-transit-delay.ts): its walk legs
   * and any dock crossing. Sent whole, so the client draws the company where
   * the server has it, even over ground the viewer can't see.
   */
  route: MusterTransitRoute;
  transitEndsAt: number;
  resolvesAt: number;
  /** Server clock when the march set out; lets the client align the deadlines to its own clock. */
  serverNow: number;
};

/** The camp tile a Planetary Defense action marches out of, or undefined for anyone else. */
export const campMarchOrigin = (
  actorId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  originKey: string
): TransitPoint | undefined => {
  if (!actorId.startsWith("barbarian-")) return undefined;
  // A camp's id is its camp tile's key.
  const campId = tiles.get(originKey)?.campId;
  const camp = campId ? tiles.get(campId) : undefined;
  return camp ? { x: camp.x, y: camp.y } : undefined;
};

export type CampMarchBroadcastDeps = {
  playerIds: () => Iterable<string>;
  /** Only humans with the game open get the march; AI players have no screen. */
  isHumanOnline: (playerId: string) => boolean;
  isVisible: (playerId: string, x: number, y: number) => boolean;
  emitPlayerMessage: (command: { commandId: string; playerId: string }, payload: Record<string, unknown>) => void;
};

export const insurgentMarchPayload = (march: CampMarch): Record<string, unknown> => ({
  type: INSURGENT_MARCH_MESSAGE_TYPE,
  commandId: march.commandId,
  actionType: march.actionType,
  campX: march.camp.x,
  campY: march.camp.y,
  fromX: march.from.x,
  fromY: march.from.y,
  toX: march.to.x,
  toY: march.to.y,
  // How long the march takes; the client starts the company this long before transitEndsAt.
  marchMs: march.route.transitMs,
  // [kind, ...] legs: WALK as its tile points, SAIL as dock and landing; legMs in the same order.
  legs: march.route.legs.map((leg) => (leg.kind === "WALK" ? { kind: "WALK", points: leg.points.map((p) => [p.x, p.y]) } : { kind: "SAIL", from: [leg.from.x, leg.from.y], to: [leg.to.x, leg.to.y] })),
  legMs: march.route.legMs,
  transitEndsAt: march.transitEndsAt,
  resolvesAt: march.resolvesAt,
  serverNow: march.serverNow
});

/** Sends the march to every online human who can see the camp, the launch tile or the target. Returns how many. */
export const broadcastCampMarch = (deps: CampMarchBroadcastDeps, march: CampMarch): number => {
  const payload = insurgentMarchPayload(march);
  // Its own id, so the gateway never files the message under the insurgent command itself.
  const commandId = `${march.commandId}:insurgent-march`;
  let sent = 0;
  for (const playerId of deps.playerIds()) {
    if (playerId.startsWith("barbarian-") || !deps.isHumanOnline(playerId)) continue;
    const sees = [march.camp, march.from, march.to].some((point) => deps.isVisible(playerId, point.x, point.y));
    if (!sees) continue;
    deps.emitPlayerMessage({ commandId, playerId }, payload);
    sent += 1;
  }
  return sent;
};

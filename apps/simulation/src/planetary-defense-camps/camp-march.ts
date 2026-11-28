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
// the launch tile or the target as the company sets out gets an
// INSURGENT_MARCH message (client-insurgent-march/ draws it in both
// renderers). A viewer is told the target only if they can see it, so the
// message never points at a fogged House tile. The route is sent whole: it is
// the company's own walk out of its camp, at most MUSTER_TRANSIT_MAX_TILES
// steps through ground next to what the viewer sees, and the client needs all
// of it to place the company on the right step at the right time.
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
  // Only a standing camp: in the moment between a House taking the camp tile
  // and the camp's land collapsing, its land still carries the campId.
  return camp?.ownerId === actorId && camp.ownershipState === "SETTLED" ? { x: camp.x, y: camp.y } : undefined;
};

export type CampMarchBroadcastDeps = {
  playerIds: () => Iterable<string>;
  /** Only humans with the game open get the march; AI players have no screen. */
  isHumanOnline: (playerId: string) => boolean;
  isVisible: (playerId: string, x: number, y: number) => boolean;
  emitPlayerMessage: (command: { commandId: string; playerId: string }, payload: Record<string, unknown>) => void;
};

/** The runtime's side of the broadcast (runtime.ts frontierCommandContext). */
export type CampMarchBroadcasterHost = {
  players: ReadonlyMap<string, { readonly isAi?: boolean | undefined }>;
  isPlayerSubscribed: (playerId: string) => boolean;
  isVisible: (playerId: string, x: number, y: number) => boolean;
  emitPlayerMessage: (command: { commandId: string; playerId: string }, payload: Record<string, unknown>) => void;
};

/** The frontier command's onCampMarch hook, built from the runtime's players, subscriptions and vision. */
export const campMarchBroadcaster = (host: CampMarchBroadcasterHost) => (march: CampMarch): void => {
  broadcastCampMarch({
    playerIds: () => host.players.keys(),
    isHumanOnline: (id) => !host.players.get(id)?.isAi && host.isPlayerSubscribed(id),
    isVisible: host.isVisible,
    emitPlayerMessage: host.emitPlayerMessage
  }, march);
};

/** The message for one viewer; `seesTarget` false leaves the target out. */
export const insurgentMarchPayload = (march: CampMarch, seesTarget = true): Record<string, unknown> => ({
  type: INSURGENT_MARCH_MESSAGE_TYPE,
  commandId: march.commandId,
  actionType: march.actionType,
  campX: march.camp.x,
  campY: march.camp.y,
  fromX: march.from.x,
  fromY: march.from.y,
  ...(seesTarget ? { toX: march.to.x, toY: march.to.y } : {}),
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
  // Its own id, so the gateway never files the message under the insurgent command itself.
  const commandId = `${march.commandId}:insurgent-march`;
  let withTarget: Record<string, unknown> | undefined;
  let withoutTarget: Record<string, unknown> | undefined;
  let sent = 0;
  for (const playerId of deps.playerIds()) {
    if (playerId.startsWith("barbarian-") || !deps.isHumanOnline(playerId)) continue;
    const seesTarget = deps.isVisible(playerId, march.to.x, march.to.y);
    if (!seesTarget && !deps.isVisible(playerId, march.camp.x, march.camp.y) && !deps.isVisible(playerId, march.from.x, march.from.y)) continue;
    const payload = seesTarget ? (withTarget ??= insurgentMarchPayload(march, true)) : (withoutTarget ??= insurgentMarchPayload(march, false));
    deps.emitPlayerMessage({ commandId, playerId }, payload);
    sent += 1;
  }
  return sent;
};

export type ProtoPreparePlayerAck = {
  ok: boolean;
  player_id?: string;
  playerId?: string;
  spawned?: boolean;
  joined?: boolean;
  full?: boolean;
  guest_full?: boolean;
  pending?: boolean;
  scheduled_start_at?: number;
};
export type PreparePlayerRallyAnchor = { x: number; y: number; island?: string };
// isGuest undefined means "unknown": the simulation then leaves a player's
// guest status alone. Only an explicit false upgrades a recorded guest.
export type PrepareLikeOptions = { isGuest?: boolean };
export type PrepareLikeRequest = { player_id: string; rally_anchor_json?: string; auth_kind?: "guest" | "account" };
export type PrepareLikeResult = {
  playerId: string;
  spawned: boolean;
  joined?: boolean;
  full?: boolean;
  guestFull?: boolean;
  pending?: boolean;
  scheduledStartAt?: number;
};

type PrepareLikeRpc = (
  request: PrepareLikeRequest,
  callback: (error: Error | null, response: ProtoPreparePlayerAck) => void
) => void;

const callPrepareLikeRpc = (
  rpc: PrepareLikeRpc | undefined,
  rpcName: string,
  playerId: string,
  rallyAnchor: PreparePlayerRallyAnchor | undefined,
  options: PrepareLikeOptions
): Promise<PrepareLikeResult> =>
  new Promise((resolve, reject) => {
    if (!rpc) {
      reject(new Error(`simulation client ${rpcName} RPC is unavailable`));
      return;
    }
    const request: PrepareLikeRequest = {
      player_id: playerId,
      ...(rallyAnchor ? { rally_anchor_json: JSON.stringify(rallyAnchor) } : {}),
      ...(options.isGuest === undefined ? {} : { auth_kind: options.isGuest ? "guest" : "account" })
    };
    rpc(request, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId:
          typeof response.player_id === "string"
            ? response.player_id
            : typeof response.playerId === "string"
              ? response.playerId
              : playerId,
        spawned: response.spawned === true,
        joined: response.joined !== false,
        full: response.full === true,
        pending: response.pending === true,
        ...(response.guest_full === true ? { guestFull: true } : {}),
        ...(typeof response.scheduled_start_at === "number" ? { scheduledStartAt: response.scheduled_start_at } : {})
      });
    });
  });

// preparePlayer only spawns territory for a player who has already joined the
// active season (see JoinSeason below) or has an existing runtime record —
// otherwise it returns joined:false without creating them. This is the gate
// that stops any authenticated connection from silently getting pulled into
// whatever season happens to be active. It runs on every login, which is also
// how the simulation learns a guest has upgraded (isGuest false).
export const preparePlayer = (
  rpc: PrepareLikeRpc | undefined,
  playerId: string,
  rallyAnchor?: PreparePlayerRallyAnchor,
  options: PrepareLikeOptions = {}
): Promise<PrepareLikeResult> => callPrepareLikeRpc(rpc, "preparePlayer", playerId, rallyAnchor, options);

// joinSeason explicitly records the player as a member of the active season
// and spawns their starting territory (unless the season is at its player
// cap, in which case it returns full:true and does not record membership, or
// a guest hits the guest allowance, in which case it returns guestFull:true).
// Call this in response to a real player action (e.g. confirming "Join
// Season N"), never automatically on every authenticated connection.
export const joinSeason = (
  rpc: PrepareLikeRpc | undefined,
  playerId: string,
  rallyAnchor?: PreparePlayerRallyAnchor,
  options: PrepareLikeOptions = {}
): Promise<PrepareLikeResult> => callPrepareLikeRpc(rpc, "joinSeason", playerId, rallyAnchor, options);

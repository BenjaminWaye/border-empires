import type { SimulationTileWireDelta } from "../runtime-types.js";

/**
 * A tile delta that removes the tile's resource (last salvage load shipped,
 * or a stripped Reclamation Works dismantled). The clear is written as
 * `resource: ""`, not `resource: undefined`: emitted events are persisted with
 * JSON.stringify, which drops undefined keys, so event replay after a restart
 * would never see the clear and would bring the depleted salvage field back.
 * "" is already the wire form of a clear (proto-serialization.ts) and the
 * gateway/client treat it the same as undefined.
 */
export const withResourceCleared = (delta: SimulationTileWireDelta): SimulationTileWireDelta =>
  ({ ...delta, resource: "" });

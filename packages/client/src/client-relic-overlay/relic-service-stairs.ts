import { BoxGeometry, CylinderGeometry, type BufferGeometry } from "three";

/** Door opening is the scale reference for the entire access route. */
export const RELIC_DOOR_HEIGHT = 0.125;
const STAIR_WIDTH = 0.13;
const FLIGHT_RUN = 0.396;
const FLIGHTS = [
  { bottom: 0, top: 0.245, z: 1.10, count: 20, direction: 1 },
  { bottom: 0.245, top: 0.435, z: 0.90, count: 16, direction: -1 },
  { bottom: 0.435, top: 0.625, z: 0.70, count: 16, direction: 1 },
  { bottom: 0.625, top: 0.795, z: 0.50, count: 15, direction: -1 }
] as const;

export type RelicStairTread = {
  readonly x: number;
  /** Walkable top of tread, relative to the relic foundation. */
  readonly y: number;
  readonly z: number;
  readonly going: number;
  readonly riser: number;
};

export const relicStairTreads = (): readonly RelicStairTread[] => FLIGHTS.flatMap((flight) => {
  const riser = (flight.top - flight.bottom) / flight.count;
  const going = FLIGHT_RUN / flight.count;
  return Array.from({ length: flight.count }, (_, step) => ({
    x: flight.direction * (-FLIGHT_RUN / 2 + (step + 0.5) * going),
    y: flight.bottom + (step + 1) * riser,
    z: flight.z, going, riser
  }));
});

export type RelicServiceStairs = {
  readonly treads: BufferGeometry[];
  readonly metal: BufferGeometry[];
};

/** Four side-to-side flights fit small risers into the stepped facade. */
export const createRelicServiceStairs = (): RelicServiceStairs => {
  const treads: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  for (const step of relicStairTreads()) {
    treads.push(new BoxGeometry(step.going, step.riser, STAIR_WIDTH)
      .translate(step.x, step.y - step.riser / 2, step.z));
    // Narrow traction strips leave the walkable tread readable close up.
    metal.push(new BoxGeometry(0.003, 0.0015, STAIR_WIDTH * 0.82)
      .translate(step.x, step.y + 0.001, step.z));
  }
  FLIGHTS.forEach((flight, index) => {
    const rise = flight.top - flight.bottom;
    const railHeight = 0.055;
    const railZ = flight.z + STAIR_WIDTH / 2;
    const railLength = Math.hypot(FLIGHT_RUN, rise);
    metal.push(new CylinderGeometry(0.0025, 0.0025, railLength, 5)
      .rotateZ(-Math.atan2(flight.direction * FLIGHT_RUN, rise))
      .translate(0, flight.bottom + rise / 2 + railHeight, railZ));
    for (let post = 0; post <= 4; post += 1) {
      const fraction = post / 4;
      metal.push(new CylinderGeometry(0.0025, 0.0025, railHeight, 5)
        .translate(flight.direction * (fraction - 0.5) * FLIGHT_RUN,
          flight.bottom + rise * fraction + railHeight / 2, railZ));
    }
    if (index < FLIGHTS.length - 1) {
      const x = flight.direction * (FLIGHT_RUN / 2 - STAIR_WIDTH / 2);
      // Turn on a full-width landing before the next flight climbs back.
      treads.push(new BoxGeometry(STAIR_WIDTH, 0.012, 0.20 + STAIR_WIDTH)
        .translate(x, flight.top - 0.006, flight.z - 0.10));
    }
    // Corroded brackets underneath the outer edge of each landing.
    metal.push(new BoxGeometry(0.025, 0.07, STAIR_WIDTH * 0.8)
      .translate(flight.direction * 0.16, flight.top - 0.047, flight.z));
  });
  // Final level walkway turns from the last flight to the sealed bulkhead.
  treads.push(new BoxGeometry(FLIGHT_RUN, 0.012, 0.28).translate(0, 0.789, 0.385));
  return { treads, metal };
};

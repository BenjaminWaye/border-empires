// Pure builder for the SET_MUSTER MARCH payload the arrow-gesture confirm
// sheet sends on "Go" -- same message shape client-muster-march-targeting.ts's
// handleMusterMarchTargetClick sends (mode: "MARCH", targetX/targetY), plus
// commitManpower the same way client-tile-action-menu-ui.ts's commit-tab
// "Save" button does. Kept pure/exported so it's unit-testable without any
// DOM, and so both the confirm sheet and its tests build the exact same
// message shape rather than each hand-rolling it.

export type ArrowGesturePoint = { x: number; y: number };

export type ArrowGestureSetMusterPayload = {
  type: "SET_MUSTER";
  x: number;
  y: number;
  mode: "MARCH";
  targetX: number;
  targetY: number;
  commitManpower: number;
};

export const buildArrowGestureSetMusterPayload = (
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  commitManpower: number
): ArrowGestureSetMusterPayload => ({
  type: "SET_MUSTER",
  x: origin.x,
  y: origin.y,
  mode: "MARCH",
  targetX: target.x,
  targetY: target.y,
  commitManpower
});

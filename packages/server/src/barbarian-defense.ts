type CombatResultChange = {
  x: number;
  y: number;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
};

type TilePoint = {
  x: number;
  y: number;
};

export const resolveFailedBarbarianDefenseOutcome = ({
  fortHeldOrigin,
  origin,
  target
}: {
  fortHeldOrigin: boolean;
  origin: TilePoint;
  target: TilePoint;
}): {
  resultChanges: CombatResultChange[];
  originLost: boolean;
  defenderTile: TilePoint;
} => {
  if (fortHeldOrigin) {
    return {
      resultChanges: [],
      originLost: false,
      defenderTile: target
    };
  }
  return {
    resultChanges: [
      { x: origin.x, y: origin.y, ownerId: "barbarian", ownershipState: "BARBARIAN" },
      { x: target.x, y: target.y }
    ],
    originLost: true,
    defenderTile: origin
  };
};

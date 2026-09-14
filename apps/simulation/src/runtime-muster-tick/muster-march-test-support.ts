import type { SimulationEvent } from "@border-empires/sim-protocol";

/**
 * Shared fixtures for the muster-march-*.test.ts files -- split out so
 * muster-march.test.ts and muster-march-routing.test.ts don't duplicate the
 * same player/event helpers.
 */
export const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

export const acceptedAttackTargets = (events: SimulationEvent[]): string[] =>
  events
    .filter(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-march:")
    )
    .map((event) => event.commandId.split(":muster-march:")[1]!.split(":")[1]!);

export const acceptedMusterMarchCommands = (events: SimulationEvent[]) =>
  events.filter(
    (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
      event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-march:")
  );

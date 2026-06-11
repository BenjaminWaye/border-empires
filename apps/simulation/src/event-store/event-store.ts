import type { SimulationEvent } from "@border-empires/sim-protocol";

export type StoredSimulationEvent = {
  eventId?: number;
  commandId: string;
  playerId: string;
  eventType: SimulationEvent["eventType"];
  eventPayload: SimulationEvent;
  createdAt: number;
};

export type SimulationEventStore = {
  appendEvent(event: SimulationEvent, createdAt: number): Promise<void>;
  loadAllEvents(): Promise<StoredSimulationEvent[]>;
  loadEventsAfter(eventId: number, limit?: number): Promise<StoredSimulationEvent[]>;
  loadEventsForCommand(commandId: string): Promise<StoredSimulationEvent[]>;
  loadLatestEventId(): Promise<number>;
};

export class InMemorySimulationEventStore implements SimulationEventStore {
  private nextEventId = 1;
  private readonly events: StoredSimulationEvent[] = [];

  async appendEvent(event: SimulationEvent, createdAt: number): Promise<void> {
    this.events.push({
      eventId: this.nextEventId++,
      commandId: event.commandId,
      playerId: event.playerId,
      eventType: event.eventType,
      eventPayload: event,
      createdAt
    });
  }

  async loadAllEvents(): Promise<StoredSimulationEvent[]> {
    return [...this.events];
  }

  async loadEventsAfter(eventId: number, limit?: number): Promise<StoredSimulationEvent[]> {
    const filtered = this.events.filter((event) => (event.eventId ?? 0) > eventId);
    return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
  }

  async loadEventsForCommand(commandId: string): Promise<StoredSimulationEvent[]> {
    return this.events.filter((event) => event.commandId === commandId);
  }

  async loadLatestEventId(): Promise<number> {
    return this.events.at(-1)?.eventId ?? 0;
  }
}

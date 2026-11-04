import { expect, it } from "vitest";
import { applySimulationEventsToRecoveredState } from "./event-recovery.js";

it("replays truce breaks and alliance changes since the last checkpoint for both players", () => {
  const before = { tiles: [], activeLocks: [], players: [
    { id: "a", truces: ["b"], allies: [] }, { id: "b", truces: ["a"], allies: [] }
  ] };
  const events = [
    { eventType: "PLAYER_MESSAGE" as const, commandId: "break", playerId: "a", messageType: "SOCIAL_STATE_SYNCED", payloadJson: JSON.stringify({ targetPlayerId: "b", truced: false }) },
    { eventType: "PLAYER_MESSAGE" as const, commandId: "ally", playerId: "b", messageType: "SOCIAL_STATE_SYNCED", payloadJson: JSON.stringify({ targetPlayerId: "a", allied: true }) }
  ];
  const after = applySimulationEventsToRecoveredState(before, events);
  expect(after.players).toEqual([
    { id: "a", truces: [], allies: ["b"] }, { id: "b", truces: [], allies: ["a"] }
  ]);
  expect(applySimulationEventsToRecoveredState(after, events).players).toEqual(after.players);
  expect(before.players[0]!.truces).toEqual(["b"]);
});

it("replays a new truce without changing alliance membership", () => {
  const result = applySimulationEventsToRecoveredState({ tiles: [], activeLocks: [], players: [{ id: "a" }, { id: "b" }] }, [
    { eventType: "PLAYER_MESSAGE", commandId: "truce", playerId: "a", messageType: "SOCIAL_STATE_SYNCED", payloadJson: JSON.stringify({ targetPlayerId: "b", truced: true }) }
  ]);
  expect(result.players).toEqual([{ id: "a", truces: ["b"] }, { id: "b", truces: ["a"] }]);
});

it("replays when each truce ends, and clears it when the truce ends", () => {
  const start = applySimulationEventsToRecoveredState({ tiles: [], activeLocks: [], players: [{ id: "a" }, { id: "b" }] }, [
    { eventType: "PLAYER_MESSAGE", commandId: "truce", playerId: "a", messageType: "SOCIAL_STATE_SYNCED", payloadJson: JSON.stringify({ targetPlayerId: "b", truced: true, endsAt: 5_000 }) }
  ]);
  expect(start.players).toEqual([
    { id: "a", truces: ["b"], truceEndsAt: { b: 5_000 } },
    { id: "b", truces: ["a"], truceEndsAt: { a: 5_000 } }
  ]);
  const ended = applySimulationEventsToRecoveredState(start, [
    { eventType: "PLAYER_MESSAGE", commandId: "end", playerId: "b", messageType: "SOCIAL_STATE_SYNCED", payloadJson: JSON.stringify({ targetPlayerId: "a", truced: false }) }
  ]);
  expect(ended.players).toEqual([{ id: "a", truces: [] }, { id: "b", truces: [] }]);
});

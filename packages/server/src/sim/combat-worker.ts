import { parentPort } from "node:worker_threads";
import { resolveCombatRoll, type CombatResolutionRequest, type CombatResolutionResult } from "./combat-shared.js";

type CombatWorkerRequest = {
  id: number;
  request: CombatResolutionRequest;
};

type CombatWorkerResponse =
  | { id: number; result: CombatResolutionResult }
  | { id: number; error: string };

const port = parentPort;

if (port) {
  port.on("message", (message: CombatWorkerRequest) => {
    try {
      const result = resolveCombatRoll(message.request);
      const response: CombatWorkerResponse = { id: message.id, result };
      port.postMessage(response);
    } catch (err) {
      const response: CombatWorkerResponse = {
        id: message.id,
        error: err instanceof Error ? err.message : String(err)
      };
      port.postMessage(response);
    }
  });
}

import { parentPort } from "node:worker_threads";
import { planAiDecision, type AiPlanningDecision, type AiPlanningSnapshot } from "./planner-shared.js";

type AiPlannerRequest = {
  id: number;
  snapshot: AiPlanningSnapshot;
};

type AiPlannerResponse =
  | { id: number; decision: AiPlanningDecision }
  | { id: number; error: string };

const port = parentPort;

if (port) {
  port.on("message", (message: AiPlannerRequest) => {
    try {
      const decision = planAiDecision(message.snapshot);
      const response: AiPlannerResponse = { id: message.id, decision };
      port.postMessage(response);
    } catch (err) {
      const response: AiPlannerResponse = {
        id: message.id,
        error: err instanceof Error ? err.message : String(err)
      };
      port.postMessage(response);
    }
  });
}

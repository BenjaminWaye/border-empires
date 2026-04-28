import { rewriteGatewaySupportsMessageType, unsupportedRewriteMessageDetail } from "./client-gateway-capabilities.js";
import type { ClientState } from "./client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

type SendMessageGuardDeps = {
  state: Pick<ClientState, "serverSupportedMessageTypes">;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  showCaptureAlert?: (title: string, detail: string, tone?: "success" | "error" | "warn") => void;
};

export const blockUnsupportedRewriteMessage = (
  payload: unknown,
  deps: SendMessageGuardDeps
): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const messageType = (payload as { type?: unknown }).type;
  if (typeof messageType !== "string") return false;
  if (rewriteGatewaySupportsMessageType(deps.state, messageType)) return false;

  const detail = unsupportedRewriteMessageDetail(messageType);
  deps.pushFeed(detail, "error", "warn");
  deps.showCaptureAlert?.("Action unavailable", detail, "warn");
  return true;
};

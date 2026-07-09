export type SubscribeOptions = {
  mode: "bootstrap-only" | "live";
  emitBootstrapEvent: boolean;
  subscriptionKey?: string;
  fullVisibility: boolean;
  trigger?: string;
};

export const parseSubscribeOptions = (subscriptionJson: string | undefined): SubscribeOptions => {
  if (!subscriptionJson) return { mode: "live", emitBootstrapEvent: true, fullVisibility: false };
  try {
    const parsed = JSON.parse(subscriptionJson) as {
      mode?: unknown;
      emitBootstrapEvent?: unknown;
      subscriptionKey?: unknown;
      fullVisibility?: unknown;
      trigger?: unknown;
    };
    return {
      mode: parsed.mode === "bootstrap-only" ? "bootstrap-only" : "live",
      emitBootstrapEvent: parsed.emitBootstrapEvent === false ? false : parsed.mode === "bootstrap-only" ? false : true,
      ...(typeof parsed.subscriptionKey === "string" && parsed.subscriptionKey.length > 0 ? { subscriptionKey: parsed.subscriptionKey } : {}),
      fullVisibility: parsed.fullVisibility === true,
      ...(typeof parsed.trigger === "string" && parsed.trigger.length > 0 ? { trigger: parsed.trigger } : {})
    };
  } catch {
    return { mode: "live", emitBootstrapEvent: true, fullVisibility: false };
  }
};

export const mobileBuildEnv = (environment = "production") => {
  if (environment !== "production" && environment !== "staging") {
    throw new Error("MOBILE_ENV must be production or staging.");
  }
  return {
    VITE_NATIVE_APP: "true",
    VITE_BACKEND_DEFAULT: "gateway",
    VITE_GATEWAY_WS_URL: environment === "production"
      ? "wss://api.borderempires.com/ws"
      : "wss://api-staging.borderempires.com/ws"
  };
};

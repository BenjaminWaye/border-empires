export const mobileBuildEnv = (environment = "production") => {
  if (environment !== "production" && environment !== "staging") {
    throw new Error("MOBILE_ENV must be production or staging.");
  }
  return {
    VITE_NATIVE_APP: "true",
    VITE_BACKEND_DEFAULT: "gateway",
    VITE_NATIVE_PUBLIC_ORIGIN: environment === "production"
      ? "https://play.borderempires.com"
      : "https://staging.borderempires.com",
    VITE_RALLY_API_ORIGIN: environment === "production"
      ? "https://api.borderempires.com"
      : "https://api-staging.borderempires.com",
    VITE_GATEWAY_WS_URL: environment === "production"
      ? "wss://api.borderempires.com/ws"
      : "wss://api-staging.borderempires.com/ws"
  };
};

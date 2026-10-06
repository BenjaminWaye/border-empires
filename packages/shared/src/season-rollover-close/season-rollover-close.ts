// When the simulation starts a new season, the gateway closes every live
// client socket with this code and reason. A connected client has no other way
// to learn the season changed: its tiles, leaderboard and join state all belong
// to the old season. Closing makes it reconnect and receive a fresh INIT.
//
// 4000-4999 is the range WebSocket reserves for application use.
export const SEASON_ROLLOVER_CLOSE_CODE = 4009;
export const SEASON_ROLLOVER_CLOSE_REASON = "season_rollover";

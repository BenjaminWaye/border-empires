import { loadBotConfig } from "./config.js";
import { postToDiscord } from "./discord-notify.js";
import { runSession } from "./session.js";

const config = loadBotConfig();

try {
  await runSession(config);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Session failed: ${message}`);
  if (config.discordWebhookUrl) {
    await postToDiscord(config.discordWebhookUrl, `**${config.botDisplayName}'s session failed:** ${message}`);
  }
  process.exitCode = 1;
}

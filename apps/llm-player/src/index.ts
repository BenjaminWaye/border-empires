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
    try {
      await postToDiscord(config.discordWebhookUrl, `**${config.botDisplayName}'s session failed:** ${message}`);
    } catch (notifyError) {
      console.error(`Also failed to post the failure to Discord: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
    }
  }
  process.exitCode = 1;
}

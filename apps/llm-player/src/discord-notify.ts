// A plain Discord webhook POST -- no bot process, no gateway connection, no
// hosting. Create one via a Discord channel's Integrations -> Webhooks
// settings and put the URL in DISCORD_WEBHOOK_URL (see .env.example).
export const postToDiscord = async (webhookUrl: string, content: string): Promise<void> => {
  // Discord message content is capped at 2000 characters.
  const truncated = content.length > 2000 ? `${content.slice(0, 1997)}...` : content;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: truncated })
  });
  if (!response.ok) {
    console.error(`Discord webhook post failed: HTTP ${response.status}`);
  }
};

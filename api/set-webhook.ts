import type { IncomingMessage, ServerResponse } from "http";
import { createBot } from "../src/bot";

const { bot } = createBot();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const host = req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const webhookUrl = `${protocol}://${host}/api/webhook`;

    console.log(`[INFO] Registering Telegram webhook to: ${webhookUrl}`);
    await bot.api.setWebhook(webhookUrl);

    const webhookInfo = await bot.api.getWebhookInfo();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        message: `Webhook successfully registered to: ${webhookUrl}`,
        webhookInfo,
      }, null, 2)
    );
  } catch (err: any) {
    console.error("[ERROR] Failed to set webhook:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      }, null, 2)
    );
  }
}

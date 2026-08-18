import type { IncomingMessage, ServerResponse } from "http";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      success: true,
      message: "Automated APOD posting is disabled. Please use the /latest command in your Telegram bot to review and manually post daily APODs.",
      timestamp: new Date().toISOString(),
    })
  );
}


import type { IncomingMessage, ServerResponse } from "http";
import { webhookCallback } from "grammy";
import { createBot } from "../src/bot";
import { stateManager } from "../src/state";

const { bot } = createBot();
const handleUpdate = webhookCallback(bot, "http");

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Sync state if remote KV is configured
  await stateManager.syncWithRemoteState();

  return handleUpdate(req, res);
}

import dotenv from "dotenv";
import path from "path";
import { BotConfig } from "./types";

dotenv.config();

export function normalizeChannelId(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // If URL like https://t.me/c/3882263274/123 -> -1003882263274
  const privateUrlMatch = trimmed.match(/t\.me\/c\/(\d+)/);
  if (privateUrlMatch && privateUrlMatch[1]) {
    return `-100${privateUrlMatch[1]}`;
  }

  // If public channel URL like https://t.me/mychannel -> @mychannel
  const publicUrlMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/);
  if (publicUrlMatch && publicUrlMatch[1] && !publicUrlMatch[1].startsWith("+")) {
    return `@${publicUrlMatch[1]}`;
  }

  // If username with @
  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  // If raw numeric ID without -100 prefix (e.g. 3882263274)
  if (/^\d+$/.test(trimmed)) {
    return `-100${trimmed}`;
  }

  return trimmed;
}

const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
const rawChannelId = process.env.TELEGRAM_CHANNEL_ID || "";
const channelId = normalizeChannelId(rawChannelId);
const cronSchedule = process.env.CRON_SCHEDULE || "0 * * * *";
const checkOnStartup = process.env.CHECK_ON_STARTUP !== "false";
const stateFilePath = process.env.STATE_FILE_PATH || path.resolve(process.cwd(), "data", "bot_state.json");
const rawAllowedUsers = process.env.ALLOWED_USERS || process.env.ALLOWED_USER_IDS || "";
const allowedUsers: number[] = rawAllowedUsers
  .split(",")
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => !isNaN(id));

if (!botToken) {
  console.warn("[WARN] TELEGRAM_BOT_TOKEN is not set in .env");
}

if (!channelId) {
  console.warn("[WARN] TELEGRAM_CHANNEL_ID is not set in .env");
}

export const config: BotConfig = {
  botToken,
  channelId,
  cronSchedule,
  checkOnStartup,
  stateFilePath,
  allowedUsers,
};

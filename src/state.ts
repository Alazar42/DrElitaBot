import fs from "fs";
import path from "path";
import { BotState } from "./types";
import { config } from "./config";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Normalizes an APOD date string (e.g. "2026 August 17") or NASA APOD URL (e.g. ap260817.html)
 * into a standardized ISO date string "YYYY-MM-DD".
 */
export function normalizeApodDateToIso(dateStr?: string, nasaUrl?: string): string {
  if (dateStr) {
    const match = dateStr.match(/(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})/);
    if (match) {
      const year = match[1];
      const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === match[2].toLowerCase());
      const day = match[3].padStart(2, "0");
      if (monthIdx !== -1) {
        const month = String(monthIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      return dateStr.trim();
    }
  }

  if (nasaUrl) {
    const urlMatch = nasaUrl.match(/ap(\d{2})(\d{2})(\d{2})\.html/i);
    if (urlMatch) {
      const year = `20${urlMatch[1]}`;
      const month = urlMatch[2];
      const day = urlMatch[3];
      return `${year}-${month}-${day}`;
    }
  }

  return dateStr ? dateStr.trim() : "";
}

/**
 * Returns today's ISO dates (YYYY-MM-DD) in both UTC and local timezone.
 */
export function getTodayIsoDates(): string[] {
  const now = new Date();

  const utcYear = now.getUTCFullYear();
  const utcMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  const utcDay = String(now.getUTCDate()).padStart(2, "0");
  const utcIso = `${utcYear}-${utcMonth}-${utcDay}`;

  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, "0");
  const localDay = String(now.getDate()).padStart(2, "0");
  const localIso = `${localYear}-${localMonth}-${localDay}`;

  return Array.from(new Set([utcIso, localIso]));
}

const defaultState: BotState = {
  lastPostedId: null,
  lastPostedDate: null,
  lastPostedIsoDate: null,
  lastCheckedAt: null,
  lastPostedAt: null,
  postedIds: [],
  postedDates: [],
  postedIsoDates: [],
};

const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const KV_KEY = "drelitabot:state";

export class StateManager {
  private filePath: string;
  private state: BotState;

  constructor(filePath: string = config.stateFilePath) {
    this.filePath = filePath;
    this.state = this.loadLocalState();
  }

  private loadLocalState(): BotState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          ...defaultState,
          ...parsed,
          postedIds: parsed.postedIds || (parsed.lastPostedId ? [parsed.lastPostedId] : []),
          postedDates: parsed.postedDates || (parsed.lastPostedDate ? [parsed.lastPostedDate] : []),
          postedIsoDates:
            parsed.postedIsoDates ||
            (parsed.lastPostedDate ? [normalizeApodDateToIso(parsed.lastPostedDate)] : []),
        };
      }
    } catch (err) {
      console.warn("[WARN] Could not read local state file (normal in serverless):", err);
    }
    return { ...defaultState };
  }

  public async syncWithRemoteState(): Promise<void> {
    if (!KV_URL || !KV_TOKEN) {
      return;
    }

    try {
      const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.result) {
          const parsed = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
          this.state = {
            ...this.state,
            ...parsed,
            postedIds: parsed.postedIds || this.state.postedIds || [],
            postedDates: parsed.postedDates || this.state.postedDates || [],
            postedIsoDates: parsed.postedIsoDates || this.state.postedIsoDates || [],
          };
        }
      }
    } catch (err) {
      console.warn("[WARN] Failed to fetch remote state from KV/Upstash:", err);
    }
  }

  public getState(): BotState {
    return { ...this.state };
  }

  public saveState(partial: Partial<BotState>): void {
    this.state = {
      ...this.state,
      ...partial,
      lastCheckedAt: new Date().toISOString(),
    };

    // 1. Try local filesystem save (for local/VPS daemon)
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch {
      // In serverless, filesystem may be read-only; silently ignore
    }

    // 2. Try remote KV save (for Vercel serverless)
    if (KV_URL && KV_TOKEN) {
      fetch(`${KV_URL}/set/${KV_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.state),
      }).catch((err) => {
        console.warn("[WARN] Failed to write state to KV/Upstash:", err);
      });
    }
  }

  /**
   * Record that a post has been successfully posted to the channel.
   */
  public savePosted(post: { id: string; dateStr: string; nasaUrl?: string }): void {
    const isoDate = normalizeApodDateToIso(post.dateStr, post.nasaUrl);
    const existingIds = this.state.postedIds || [];
    const existingDates = this.state.postedDates || [];
    const existingIsoDates = this.state.postedIsoDates || [];

    const updatedIds = [post.id, ...existingIds.filter((id) => id !== post.id)].slice(0, 100);
    const updatedDates = [post.dateStr, ...existingDates.filter((d) => d !== post.dateStr)].slice(0, 100);
    const updatedIsoDates = isoDate
      ? [isoDate, ...existingIsoDates.filter((d) => d !== isoDate)].slice(0, 100)
      : existingIsoDates;

    this.saveState({
      lastPostedId: post.id,
      lastPostedDate: post.dateStr,
      lastPostedIsoDate: isoDate || this.state.lastPostedIsoDate,
      lastPostedAt: new Date().toISOString(),
      postedIds: updatedIds,
      postedDates: updatedDates,
      postedIsoDates: updatedIsoDates,
    });
  }

  /**
   * Checks if a post has already been posted based on its post ID, date string, or NASA URL.
   */
  public isAlreadyPosted(postId: string, dateStr?: string, nasaUrl?: string): boolean {
    if (this.state.lastPostedId && this.state.lastPostedId === postId) {
      return true;
    }

    if (this.state.postedIds && this.state.postedIds.includes(postId)) {
      return true;
    }

    const isoDate = normalizeApodDateToIso(dateStr, nasaUrl);
    if (isoDate) {
      if (this.state.lastPostedIsoDate && this.state.lastPostedIsoDate === isoDate) {
        return true;
      }
      if (this.state.lastPostedDate && normalizeApodDateToIso(this.state.lastPostedDate) === isoDate) {
        return true;
      }
      if (this.state.postedIsoDates && this.state.postedIsoDates.includes(isoDate)) {
        return true;
      }
      if (this.state.postedDates && this.state.postedDates.some((d) => normalizeApodDateToIso(d) === isoDate)) {
        return true;
      }
    }

    if (dateStr && this.state.lastPostedDate && this.state.lastPostedDate.trim().toLowerCase() === dateStr.trim().toLowerCase()) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a specific date (e.g. today's date) has already been posted.
   */
  public isDateAlreadyPosted(dateStr?: string, nasaUrl?: string): boolean {
    const isoDate = normalizeApodDateToIso(dateStr, nasaUrl);
    if (!isoDate) return false;

    if (this.state.lastPostedIsoDate === isoDate) return true;
    if (this.state.lastPostedDate && normalizeApodDateToIso(this.state.lastPostedDate) === isoDate) return true;
    if (this.state.postedIsoDates && this.state.postedIsoDates.includes(isoDate)) return true;
    if (this.state.postedDates && this.state.postedDates.some((d) => normalizeApodDateToIso(d) === isoDate)) return true;

    return false;
  }

  /**
   * Checks if today's APOD has already been posted (evaluating both UTC and local timezone).
   */
  public isTodayAlreadyPosted(): boolean {
    const todayIsos = getTodayIsoDates();
    return todayIsos.some((todayIso) => this.isDateAlreadyPosted(todayIso));
  }
}

export const stateManager = new StateManager();

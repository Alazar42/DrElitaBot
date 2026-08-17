import fs from "fs";
import path from "path";
import { ApodEvaluation, ApodPost, BotState } from "./types";
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
 * Normalizes an APOD date string (e.g. "2026 August 17", "August 17, 2026", "2026-08-17")
 * or NASA APOD URL (e.g. ap260817.html) into a standardized ISO date string "YYYY-MM-DD".
 */
export function normalizeApodDateToIso(dateStr?: string, nasaUrl?: string): string {
  if (dateStr) {
    const cleanStr = dateStr.trim();

    // Direct ISO format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      return cleanStr;
    }

    // Format: "YYYY Month DD" (e.g. "2026 August 17")
    const matchYMD = cleanStr.match(/(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})/);
    if (matchYMD) {
      const year = matchYMD[1];
      const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === matchYMD[2].toLowerCase());
      const day = matchYMD[3].padStart(2, "0");
      if (monthIdx !== -1) {
        const month = String(monthIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }

    // Format: "Month DD, YYYY" or "Month DD YYYY" (e.g. "August 17, 2026")
    const matchMDY = cleanStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (matchMDY) {
      const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === matchMDY[1].toLowerCase());
      const day = matchMDY[2].padStart(2, "0");
      const year = matchMDY[3];
      if (monthIdx !== -1) {
        const month = String(monthIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }

    // Format: "DD Month YYYY" (e.g. "17 August 2026")
    const matchDMY = cleanStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (matchDMY) {
      const day = matchDMY[1].padStart(2, "0");
      const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === matchDMY[2].toLowerCase());
      const year = matchDMY[3];
      if (monthIdx !== -1) {
        const month = String(monthIdx + 1).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
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
 * Returns today's ISO date (YYYY-MM-DD) formatted for a given timezone.
 */
export function getIsoDateInTimezone(date: Date = new Date(), timeZone?: string): string {
  try {
    const tz = timeZone || config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

/**
 * Returns today's ISO dates (YYYY-MM-DD) across local/configured timezone, UTC, and NASA (America/New_York).
 */
export function getTodayIsoDates(configuredTz?: string): string[] {
  const now = new Date();
  const tz = configuredTz || config.timezone;

  const localIso = getIsoDateInTimezone(now, tz);
  const utcIso = getIsoDateInTimezone(now, "UTC");
  const nasaIso = getIsoDateInTimezone(now, "America/New_York");

  return Array.from(new Set([localIso, utcIso, nasaIso]));
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
   * Records a date as already posted (e.g. from existing channel posts).
   */
  public markDateAsPosted(dateStr: string, nasaUrl?: string, postId?: string): void {
    const isoDate = normalizeApodDateToIso(dateStr, nasaUrl);
    const existingIds = this.state.postedIds || [];
    const existingDates = this.state.postedDates || [];
    const existingIsoDates = this.state.postedIsoDates || [];

    const updatedIds = postId ? [postId, ...existingIds.filter((id) => id !== postId)].slice(0, 100) : existingIds;
    const updatedDates = [dateStr, ...existingDates.filter((d) => d !== dateStr)].slice(0, 100);
    const updatedIsoDates = isoDate
      ? [isoDate, ...existingIsoDates.filter((d) => d !== isoDate)].slice(0, 100)
      : existingIsoDates;

    this.saveState({
      lastPostedId: postId || this.state.lastPostedId,
      lastPostedDate: dateStr || this.state.lastPostedDate,
      lastPostedIsoDate: isoDate || this.state.lastPostedIsoDate,
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
   * Checks if today's APOD has already been posted across local timezone, UTC, and NASA Eastern time.
   */
  public isTodayAlreadyPosted(): boolean {
    const todayIsos = getTodayIsoDates();
    return todayIsos.some((todayIso) => this.isDateAlreadyPosted(todayIso));
  }

  /**
   * Cross-checks an APOD post against the current calendar day and state.
   * Determines if the post is:
   * - Already posted to the channel
   * - Stale/yesterday's data (when new post for today is not yet out)
   * - A valid new post for today
   * - Forced by manual override
   */
  public evaluateApodPost(post: ApodPost, force: boolean = false): ApodEvaluation {
    const localTodayIso = getIsoDateInTimezone(new Date(), config.timezone);
    const validTodayIsoDates = getTodayIsoDates(config.timezone);
    const postIsoDate = normalizeApodDateToIso(post.dateStr, post.nasaUrl);

    if (!postIsoDate) {
      return {
        shouldPost: false,
        reason: "invalid",
        message: `Could not parse date for post ID ${post.id} ("${post.dateStr}").`,
        postIsoDate: "",
        todayIso: localTodayIso,
        validTodayIsoDates,
      };
    }

    if (force) {
      return {
        shouldPost: true,
        reason: "forced",
        message: `Manual force post approved for APOD [${post.dateStr}] (ID: ${post.id}, ISO: ${postIsoDate}).`,
        postIsoDate,
        todayIso: localTodayIso,
        validTodayIsoDates,
      };
    }

    // 1. Check if post has already been posted to the channel
    if (this.isAlreadyPosted(post.id, post.dateStr, post.nasaUrl)) {
      return {
        shouldPost: false,
        reason: "already_posted",
        message: `APOD post [${post.dateStr}] (ID: ${post.id}, ISO: ${postIsoDate}) has already been posted to the channel.`,
        postIsoDate,
        todayIso: localTodayIso,
        validTodayIsoDates,
      };
    }

    // 2. Cross-check date: Is this post actually for today, or is it older/yesterday's data?
    const isTodayPost = validTodayIsoDates.includes(postIsoDate);
    const isPastDate = postIsoDate < localTodayIso;

    if (!isTodayPost && isPastDate) {
      // It's a post from a previous day (e.g. yesterday August 17 when today is August 18)
      // Automatically register the post in state so it doesn't get repeatedly re-evaluated on fresh restarts
      this.markDateAsPosted(post.dateStr, post.nasaUrl, post.id);

      return {
        shouldPost: false,
        reason: "stale_data",
        message: `Current local date is ${localTodayIso}, but the latest post in @apod_telegram is from ${post.dateStr} (${postIsoDate}). Today's APOD has not been published by NASA yet.`,
        postIsoDate,
        todayIso: localTodayIso,
        validTodayIsoDates,
      };
    }

    // 3. Post is matching today's date and has not been posted yet
    return {
      shouldPost: true,
      reason: "new_post",
      message: `Found new APOD post for today [${post.dateStr}] (ID: ${post.id}, ISO: ${postIsoDate}) - "${post.title}".`,
      postIsoDate,
      todayIso: localTodayIso,
      validTodayIsoDates,
    };
  }
}

export const stateManager = new StateManager();

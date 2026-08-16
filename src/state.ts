import fs from "fs";
import path from "path";
import { BotState } from "./types";
import { config } from "./config";

const defaultState: BotState = {
  lastPostedId: null,
  lastPostedDate: null,
  lastCheckedAt: null,
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
        return { ...defaultState, ...JSON.parse(raw) };
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
          this.state = { ...this.state, ...parsed };
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

  public isAlreadyPosted(postId: string, dateStr: string): boolean {
    if (this.state.lastPostedId && this.state.lastPostedId === postId) {
      return true;
    }
    if (this.state.lastPostedDate && this.state.lastPostedDate === dateStr) {
      return true;
    }
    return false;
  }
}

export const stateManager = new StateManager();

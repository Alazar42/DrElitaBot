import fs from "fs";
import path from "path";
import { BotState } from "./types";
import { config } from "./config";

const defaultState: BotState = {
  lastPostedId: null,
  lastPostedDate: null,
  lastCheckedAt: null,
};

export class StateManager {
  private filePath: string;
  private state: BotState;

  constructor(filePath: string = config.stateFilePath) {
    this.filePath = filePath;
    this.state = this.loadState();
  }

  private loadState(): BotState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return { ...defaultState, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error("Error reading state file, initializing default state:", err);
    }
    return { ...defaultState };
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

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (err) {
      console.error("Error saving state file:", err);
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

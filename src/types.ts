export interface ApodPost {
  id: string;
  dateStr: string;
  nasaUrl: string;
  title: string;
  cleanHtml: string;
  rawText: string;
  photoUrl?: string;
  videoUrl?: string;
  hdUrl?: string;
  discussUrl?: string;
}

export interface BotState {
  lastPostedId: string | null;
  lastPostedDate: string | null;
  lastPostedIsoDate?: string | null;
  lastCheckedAt: string | null;
  lastPostedAt?: string | null;
  postedIds?: string[];
  postedDates?: string[];
  postedIsoDates?: string[];
}

export interface BotConfig {
  botToken: string;
  channelId: string;
  cronSchedule: string;
  checkOnStartup: boolean;
  stateFilePath: string;
  allowedUsers: number[];
}

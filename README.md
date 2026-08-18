# DrElitaBot - NASA APOD Telegram Forwarder

A Telegram bot written in TypeScript that monitors the official [NASA Astronomy Picture of the Day (@apod_telegram)](https://t.me/apod_telegram) channel and allows authorized users to manually review and forward daily APOD posts with high-resolution imagery and formatted explanations directly to your Telegram channel with one click.

Supports both **Vercel Serverless (100% Free Tier)** and traditional **Node.js standalone** deployments.

---

## Features

- **Manual Posting with One-Click Confirmation**: Fetch the latest APOD anytime and review it before publishing with interactive inline buttons (`🚀 Post to Channel` / `❌ Cancel`).
- **Single Unified Photo + Caption Message**: Delivers posts with the image and complete formatted explanation (including clickable links and credits) attached directly as a single Telegram message.
- **Direct Media Buffer Upload**: Downloads media in-memory and uploads raw image bytes (`InputFile`) to Telegram to avoid third-party CDN rate-limiting or broken preview errors.
- **State Deduplication**: Automatically tracks published post IDs and dates to prevent duplicates.
- **Access-Controlled Commands**: Whitelisted commands (`/latest`, `/help`) restricted to authorized Telegram user IDs.
- **1-Click Webhook Registration**: Easy `/api/set-webhook` endpoint to connect Telegram to your Vercel deployment instantly.

---

## Commands

Authorized users (configured via `ALLOWED_USERS`) can interact with the bot using the following commands:

| Command | Description |
| :--- | :--- |
| `/latest` | Previews the latest APOD post in private chat with interactive `🚀 Post to Channel` and `❌ Cancel` buttons |
| `/help` or `/start` | Displays bot description and available commands |

> **Note:** Any user not listed in `ALLOWED_USERS` will be denied access when sending commands or clicking inline buttons.

---

## How It Works

1. Send `/latest` to the bot in private chat.
2. The bot fetches the latest NASA APOD from `@apod_telegram`, displaying the high-resolution photo/video, title, date, formatted caption, and current status badge.
3. Click:
   - **`🚀 Post to Channel`**: Publishes the APOD directly to your configured Telegram channel (`TELEGRAM_CHANNEL_ID`) and marks it as posted in state.
   - **`❌ Cancel`**: Cancels the operation and dismisses the action.

---
## Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alazar42/DrElitaBot.git
   cd DrElitaBot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, and `ALLOWED_USERS`.

4. **Run locally:**
   ```bash
   npm run dev
   ```

---

## Project Structure

```text
DrElitaBot/
├── api/
│   ├── cron.ts             # Status endpoint (cron auto-post disabled)
│   ├── set-webhook.ts      # 1-click Telegram webhook registration (/api/set-webhook)
│   └── webhook.ts          # Telegram webhook update receiver (/api/webhook)
├── data/
│   └── .gitkeep            # Directory for local runtime state
├── src/
│   ├── bot.ts              # Bot instance, whitelist middleware, inline buttons & commands
│   ├── caption.ts          # HTML parser and caption length limiter
│   ├── config.ts           # Environment variables configuration
│   ├── index.ts            # Local standalone daemon entry point
│   ├── media.ts            # Media buffer downloader & InputFile generator
│   ├── poster.ts           # Channel publisher (single-message photo + caption)
│   ├── scheduler.ts        # APOD check and publisher utilities
│   ├── scraper.ts          # APOD Telegram channel parser
│   ├── state.ts            # State deduplication (local JSON + Upstash KV support)
│   └── types.ts            # TypeScript interfaces
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── LICENSE                 # MIT License
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vercel.json             # Vercel configuration
└── README.md               # Project documentation
```

---

## License

This project is licensed under the [MIT License](LICENSE).


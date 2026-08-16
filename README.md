# DrElitaBot - NASA APOD Telegram Forwarder

An automated Telegram bot written in TypeScript that monitors the official [NASA Astronomy Picture of the Day (@apod_telegram)](https://t.me/apod_telegram) channel and automatically forwards daily APOD posts with high-resolution imagery and formatted explanations directly to your Telegram channel.

---

## Features

- **Automated Hourly Monitoring**: Runs a background cron scheduler to detect and publish new daily APOD posts as soon as NASA releases them.
- **Single Unified Photo + Caption Message**: Delivers posts with the image and complete formatted explanation (including clickable links and credits) attached directly as a single Telegram message.
- **Direct Media Buffer Upload**: Downloads media in-memory and uploads it as raw image bytes (`InputFile`) to Telegram to avoid third-party CDN rate-limiting or broken preview errors.
- **State Deduplication**: Automatically records posted post IDs and dates in a local state store (`data/bot_state.json`) to prevent duplicate publications across restarts.
- **Access-Controlled Commands**: Restricted command access for authorized Telegram user IDs.
- **Graceful Shutdown**: Handles process termination cleanly (`SIGINT`/`SIGTERM`).

---

## Commands

Authorized users (configured via `ALLOWED_USERS`) can interact with the bot using the following commands:

| Command | Description |
| :--- | :--- |
| `/help` or `/start` | Displays bot description and list of available commands |
| `/latest` | Previews the latest APOD post in private chat with the image and formatted explanation |
| `/post_today` | Manually checks and publishes today's APOD to the target channel (skips if already posted) |

> **Note:** Any user not listed in `ALLOWED_USERS` will be denied access when sending commands.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or later recommended)
- [npm](https://www.npmjs.com/)
- A Telegram Bot token from [@BotFather](https://t.me/BotFather)
- A Telegram Channel where your bot has been added as an **Administrator** with **Post Messages** permission.

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alazar42/DrElitaBot.git
   cd DrElitaBot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   ```ini
   # Telegram Bot API Token obtained from @BotFather
   TELEGRAM_BOT_TOKEN=your-bot-token

   # Target Telegram Channel ID or @username (e.g. -100xxxxxxxxxx or @your_channel_name)
   TELEGRAM_CHANNEL_ID=your-channel-id

   # Cron expression for automated checks (Default: every hour on the hour)
   CRON_SCHEDULE=0 * * * *

   # Check and post the latest APOD on startup if not already posted (true/false)
   CHECK_ON_STARTUP=true

   # Comma-separated list of Telegram User IDs authorized to use bot commands
   ALLOWED_USERS=your-user-id-1,your-user-id-2
   ```

---

## Running the Bot

### Development Mode
Runs the project with `nodemon` and `ts-node` for automatic reloading on code changes:
```bash
npm run dev
```

### Production Build & Run
Compile TypeScript to JavaScript and run with Node:
```bash
npm run build
npm start
```

---

## Project Structure

```text
DrElitaBot/
├── data/
│   └── .gitkeep            # Persistent directory for runtime state (bot_state.json)
├── src/
│   ├── bot.ts              # Telegram bot instance, authorization middleware & command handlers
│   ├── config.ts           # Environment variables configuration and validation
│   ├── index.ts            # Application entry point and process lifecycle management
│   ├── media.ts            # Image buffer fetcher and Grammy InputFile utility
│   ├── poster.ts           # Channel publisher and single-message formatter
│   ├── scheduler.ts        # node-cron scheduler for periodic APOD checks
│   ├── scraper.ts          # Parser for NASA APOD Telegram channel web previews
│   ├── state.ts            # Local JSON state manager for post deduplication
│   └── types.ts            # TypeScript interfaces and data models
├── .env.example            # Template for environment configuration
├── .gitignore              # Git ignore rules for node_modules, build artifacts, and secrets
├── LICENSE                 # MIT License
├── package.json            # Project dependencies and npm scripts
├── tsconfig.json           # TypeScript compiler configuration (NodeNext)
└── README.md               # Project documentation
```

---

## How It Works

1. **Source**: Fetches recent public posts from `https://t.me/s/apod_telegram`.
2. **Parser**: Extracts the APOD date, title, clean HTML explanation, clickable NASA URLs, and image/video sources.
3. **Deduplication**: Compares against `data/bot_state.json`. If the post was already published, it skips posting.
4. **Media Dispatch**: Downloads the image into memory and dispatches it via `bot.api.sendPhoto` along with the formatted caption in a single Telegram message.
5. **Scheduler**: Automatically repeats this check every hour via `node-cron`.

---

## License

This project is licensed under the [MIT License](LICENSE).

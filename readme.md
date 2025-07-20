# Alfred.ai 🏠

> **Smart Telegram Assistant for Bali Rental Listings**  
> Complete documentation for development, usage, architecture, scraper details, and the function of every file and module.

---

## Table of Contents
- [Project Overview](#project-overview)
- [How It Works (Data Flow)](#how-it-works-data-flow)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Folder and File Explanations](#folder-and-file-explanations)
  - [index.js](#indexjs---application-entry-point)
  - [bot/](#bot)
  - [scrapers/](#scrapers)
  - [services/](#services)
  - [db/](#db)
  - [config/](#config)
  - [logs/](#logs)
  - [ecosystem.config.js](#ecosystemconfigjs)
  - [.env.example](#envexample)
- [Core Scrapers: How They Work](#core-scrapers-how-they-work)
- [Core Features and Functions](#core-features-and-functions)
- [Bot Workflows (Telegram Commands & Flow)](#bot-workflows-telegram-commands--flow)
- [Database Schema](#database-schema)
- [Setup & Installation](#setup--installation)
- [Deployment & Production](#deployment--production)
- [Extending Alfred.ai](#extending-alfredai)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Project Overview

**Alfred.ai** is a Telegram bot that helps users find the best rental listings in Bali. It automates:
- Web scraping of Facebook Marketplace, Facebook Groups, and multiple property websites.
- Matching listings to user preferences (location, budget, rooms, duration, furnished/unfurnished).
- Delivering daily and on-demand digests directly on Telegram.
- Storing all data and user actions in a modern [Supabase](https://supabase.com/) PostgreSQL database.

---

## How It Works (Data Flow)

1. **Onboarding:**  
   User starts the bot (`/start`), sets preferences via interactive chat.

2. **Scraping:**  
   Every morning (cron job), all `scrapers/` run, fetching fresh listings from configured online sources.

3. **Filtering:**  
   Listings are de-duplicated and filtered according to user preferences using business logic.

4. **Sending Listings:**  
   Top matches (up to 3) are formatted and sent to the user via Telegram.

5. **User Interaction (Save/Hide):**  
   User can save or hide listings, which is tracked in `user_interactions`.

6. **Database:**  
   All persistent data (listings, preferences, actions) goes to Supabase/PostgreSQL.

---

## Tech Stack

| Purpose          | Library/Service                  |
|------------------|----------------------------------|
| Backend          | Node.js (18.x preferred)         |
| Bot Framework    | Telegraf.js                      |
| Web Scraping     | Puppeteer, Playwright, Cheerio, Axios |
| Database         | Supabase (PostgreSQL)            |
| Scheduling       | node-cron, PM2                   |
| Deployment       | VPS (Ubuntu/Debian), PM2         |
| Configuration    | dotenv (`.env`), JSON/JS config  |

---

## Project Structure

alfred-ai/
├── index.js
├── bot/
│ ├── bot.js
│ ├── handlers/
│ │ ├── start.js
│ │ ├── preferences.js
│ │ └── listings.js
│ └── utils/
│ ├── database.js
│ ├── formatter.js
│ ├── validator.js
│ └── logger.js
├── scrapers/
│ ├── index.js
│ ├── fbMarketplace.js
│ ├── fbGroups.js
│ ├── rumahKost.js
│ ├── villaHub.js
│ ├── homeImmo.js
│ └── rentRoomBali.js
├── services/
│ └── dailyDigest.js
├── config/
│ └── constants.js
├── db/
│ └── schema.sql
├── logs/
├── ecosystem.config.js
├── .env.example
├── package.json
└── README.md

---

## Folder and File Explanations

### index.js — **Application Entry Point**
- **Bootstraps the whole bot.**
- Launches the `/bot/bot.js` Telegram bot.
- Sets up webhook server in development mode, or polling in production.
- Starts the scheduled job for daily scraping and notifications (`runAllScrapers` and `services/dailyDigest.js`).
- Handles shutdown and error events.

---

### bot/

#### bot.js
- Main Telegraf bot instance.
- Sets up the `/start`, `/listings`, and other commands.
- Connects to handlers for onboarding, preferences, and listings.
- Exports both webhook and polling bot launching modes.

#### handlers/
- **start.js** — Handles initial onboarding, collects user’s Telegram ID, name, and begins the preferences process.
- **preferences.js** — Manages interactive flow for setting location, budget, room count, duration, and furnished options. Saves user preferences.
- **listings.js** — Handles `/listings` command and button-based actions (save/hide listing). Filters, formats, and sends current listings.

#### utils/
- **database.js**
    - Exports key functions to query and update Supabase/PostgreSQL.
    - Handles: user creation, fetching/saving preferences, storing new listings, logging interactions, stats, etc.
- **formatter.js**
    - Functions for formatting listings into HTML-rich Telegram messages.
    - Shortens descriptions, adds bold, links, emojis.
- **validator.js**
    - Input validation and sanitization for all user data, preferences, and listings. Prevents bad data from being stored or output.
- **logger.js**
    - Unified logging (console + file) system, logs to `/logs/` and rotates large files.

---

### scrapers/
**Each scraper exports an async `.scrape()` function returning a list of `{title, price, location, ...}` objects.**

- **index.js**
    - Orchestrates running all scrapers (FB, property sites, etc).
    - Collects all listings, deduplicates, and stores in DB.
- **fbMarketplace.js**
    - Puppeteer-based scraper for Facebook Marketplace, logs in using credentials from `.env`, waits for elements, extracts property details.
- **fbGroups.js**
    - Scrapes specified Bali housing Facebook groups for relevant posts, parses price/location/title from post text and images.
- **rumahKost.js, villaHub.js, homeImmo.js, rentRoomBali.js**
    - Axios + Cheerio powered scrapers for mainstream Balinese rental sites.
    - Flexible selectors and logic for extracting title, price, description, images, etc.
    - Converts foreign prices/IDR to USD on the fly.

---

### services/

#### dailyDigest.js
- Sends a daily message to every active user.
- Pulls their preferences, retrieves matching listings, formats and sends the top 3.
- Can also be used for weekly stats or other mass messages.

---

### db/

#### schema.sql
- SQL schema for all database tables:
    - `users` — Telegram users.
    - `user_preferences` — One-to-one preference records.
    - `listings` — All property listings (de-duplicated by URL).
    - `user_interactions` — Trackings (e.g. viewed/saved/hidden).
- Includes indexes for fast queries.

---

### config/

#### constants.js
- Project-wide constants.
- Source mappings, price ranges, scraping config, etc.

---

### logs/
- Log files for bot and scraping operations.
- Auto-rotates by logger.js.

---

### ecosystem.config.js
- [PM2](https://pm2.keymetrics.io/) configuration:  
    - Handles process management and automatic restarts on your VPS.
    - Schedules the scrapers/daily job via cron.

---

### .env.example
- Template environment file for all secrets and credentials (API keys, Postgres URL, Telebot token, Facebook login, etc).

---

## Core Scrapers: How They Work

Each `<site>.js` file in `scrapers/`:
- Defines a class/object with `.scrape()` method.
- For Facebook: uses Puppeteer to load/login and parse SPA content.
- For others: uses Axios (HTTP client) + Cheerio (jQuery-like DOM parsing).
- Extracts: title, price (and converts from IDR if needed), location, room count, furnished info, description, images, and direct listing URL.
- Handles errors gracefully, limits to 20 listings per source.
- Normalizes all output to the same interface for storage and further filtering.

---

## Core Features and Functions

### Matching/Filtering Algorithm
- For each user, fetches their preferences (`location`, `max_budget`, etc).
- Fetches newest listings from DB, *filters* for:
    - Location matches (fuzzy/substring matching for Canggu, Seminyak, Ubud etc).
    - Price ≤ user’s max budget
    - min_rooms ≥ requirement
    - Furnished/unfurnished preference if set.
- Returns listings with the closest possible match.

### De-duplication
- Scraped listings are identified and checked by unique URL in the DB.
- Always upserts by `listing_url` to prevent duplicates.

---

## Bot Workflows (Telegram Commands & Flow)

- `/start` – Onboards user interactively, collects all needed preferences, and stores them.
- `/listings` – Returns up-to-date matching listings immediately (user can press button anytime).
- `/preferences` – Lets users change their search filters at any time.
- `Save`/`Hide` (inline buttons) – Lets users save favorites or tell the bot not to show unwanted listings (tracked in the DB).
- Morning digest (scheduled) – Bot sends 3 new matches every day at 9am automatically.
- All bot messages use rich formatting and emoji for clarity.

---

## Database Schema

(See `/db/schema.sql`):

- **users**: Telegram ID (unique), username, name, created/updated, is_active
- **user_preferences**: `user_id` → foreign key, location, max_budget, min_rooms, duration, furnished_preference, created/update
- **listings**: title, price, location, rooms, furnished, description, images, URL (unique), source, scraped_at
- **user_interactions**: user_id, listing_id, action (viewed, saved, hidden), timestamp

---

## Deployment & Production

1. **VPS**: Provision Ubuntu/Debian VPS, SSH in and install Node.js, npm, pm2.
2. **Clone/Sync this repo on the VPS**
3. **Configure** `.env` (with real server credentials).
4. **Install** dependencies: `npm install --production`
5. **Install Chromium/ffmpeg if scrapers need**
6. **PM2 process management**
- `pm2 start ecosystem.config.js`
- `pm2 save`
- `pm2 startup`
7. **Check Logs:** `pm2 logs` for live bot/scraper output

---

## Extending Alfred.ai

- **Add new rental sources:**  
- Create `scrapers/newSite.js` — export `.scrape()` that returns normalized objects.
- Add to `scrapers/index.js` run queue.
- **Improve filtering:**  
- Tune matching/fuzzy matching logic in `formatter.js` / handler files.
- **Enhance bot UX:**  
- Add more commands or feedback options in `/bot/handlers/*`.

---

## FAQ

**Q:** Where do I add more Facebook groups/websites?  
**A:** In `/scrapers/fbGroups.js` there's an array of group URLs; just add more!

**Q:** How to keep secrets out of Git?
**A:** `.env` and credentials should never be committed. `.env.example` is the only env file tracked.

**Q:** How do I get logs for debugging?
**A:** Check `/logs/` for rolling log files, and use `pm2 logs` for live tails.

---

## Contributing

1. Fork and clone this repo.
2. Create a new branch (`feature/my-feature`).
3. Make changes, [write tests if possible].
4. Commit and push.
5. Open a Pull Request!

---

## License

MIT License.  
See [`LICENSE`](LICENSE).

---

**Alfred.ai** — Built for Bali’s digital nomads  

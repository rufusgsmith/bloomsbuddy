@AGENTS.md

# Bloomsbuddy

Hackathon project for the UCL Claude Campus Hackathon (Fri 16 Oct 2026, "Better Student Life" track). Solo builder with some coding experience — explain key decisions briefly.

## What it does
UCL students have gaps between lectures and waste them. Bloomsbuddy finds the gaps in a student's timetable and uses Claude to recommend the best thing to do in each one: **a top pick + 2 alternatives, each with a reason**. Inputs:
- **Timetable and Moodle deadlines**: added by uploading screenshots, which Claude reads with vision
- **Live UCL Library seat counts**: scraped from a public page
- **Society events**: scraped from Students' Union pages
- **Location**: inferred from the previous lecture's room, with a manual override

**Voice**: warm, casual, a bit cheeky. Like a friend who knows UCL's campus.

## Stack (keep it minimal)
- Next.js (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk` using model `claude-sonnet-5-5`
- `cheerio` for scraping
- `localStorage` for user data: no database, no login
- Deployed on Vercel

## Architecture rule
Every data source sits behind a **provider interface** with a `mock` and a `real` implementation. The `DEMO_MODE` env flag switches between them (see `lib/config.ts`).
- Build against mock data first.
- **Demo mode must always keep working as a fallback.** It's ON unless `DEMO_MODE=false`, so a missing env var can't break the demo.
- If a real provider throws or times out, fall back to its mock and don't crash the page.

## Time rules (important)
- Everything is **Europe/London**. Servers (Vercel) run in UTC, so never rely on the machine's local time.
- Absolute instants are stored as ISO 8601 strings **with an explicit offset**, e.g. `2026-10-16T10:00:00+01:00`.
- For display or "what day/hour is it", use `Intl.DateTimeFormat` with `timeZone: "Europe/London"`, not `Date#getHours()` and friends.
- BST ends Sun 25 Oct 2026. Until then London is `+01:00`, and after it's `+00:00`.

## Layout
- `app/`: Next.js routes and UI. Claude calls go in route handlers (server-side only).
- `lib/types.ts`: shared domain types (serialisable; they go to localStorage and into prompts)
- `lib/buildings.ts`: UCL building coordinates + `walkingMins()`
- `lib/config.ts`: `isDemoMode()`
- `lib/mock/`: one realistic student week (Mon 12 – Fri 16 Oct 2026)
- `lib/providers/`: provider interfaces + mocks; `societies.ts` is the real SU events provider (seats are still mock-only)
- `lib/societies/su-site.ts`: SU website fetching/slugs (cheerio)
- `lib/claude-json.ts`: shared schema-constrained Claude call

## Conventions
- Secrets live only in `.env.local` (gitignored). `ANTHROPIC_API_KEY` is server-side only and never imported into client components.
- `.env.example` documents every env var.
- Keep dependencies minimal and ask before adding new ones.

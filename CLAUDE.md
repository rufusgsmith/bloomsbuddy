@AGENTS.md

# Bloomsbuddy

Hackathon project for the UCL Claude Campus Hackathon (Fri 16 Oct 2026, "Better Student Life" track). Solo builder with some coding experience — explain key decisions briefly.

## What it does
UCL students have gaps between lectures and waste them. Bloomsbuddy finds the gaps in a student's timetable and uses Claude to recommend the best thing to do in each one: **a top pick + 2 alternatives, each with a reason**. Pick types: `study`, `event`, `rest`, `home`, `food`. Inputs:
- **Timetable and Moodle deadlines**: added by uploading screenshots, which Claude reads with vision
- **Estimated library busyness**: one real seat snapshot (Tue 11:40) scaled by time of day and weekday. The live UCL seat page can't be fetched server-side (Cloudflare's bot check), so recommendations use mock seats only and there is no scraper. It CAN be embedded as an iframe in the student's browser: the Library tab (`app/library/`) shows it with an "Open on UCL site ↗" link, and falls back to a card with a link if the iframe errors or doesn't load within 8s
- **Society events**: scraped straight from each society's Students' Union `/events` page (no Claude, no tokens). Students add a society by pasting its SU page link. Each upcoming event with a real time (not "Time TBC") has an "Add to my calendar" button: it saves a one-off `society` manual event linked by `societyEventId` (`manualFromSociety`), then shows "Added ✓" (two taps to remove)
- **Location**: inferred from the previous lecture's room (`findGaps` supports a manual override, but no UI sets it yet)
- **Home**: a hall (from `BUILDINGS`: every UCL hall, including One Pool Street at UCL East, plus the University of London intercollegiate halls), a private UK postcode (turned into lat/lng server-side by `/api/postcode` via postcodes.io), or "Don't use my home". Picked with `app/home-picker.tsx` (UCL hall search, "Private accommodation" postcode checked in code by `lib/postcode.ts`, or "Skip / don't use my home") from the Home button on the Today page or the skippable Home step in setup, saved in localStorage under its own key (works in the demo week too). Claude only suggests going home when `get_home` says the round trip leaves 30+ min there; `recommend.ts` rejects a `home` pick otherwise
- **Lunch**: `lib/lunch.ts` flags a gap with 15+ usable min inside 12:00–14:00 London when no earlier gap that day had 30+ min there. Claude then usually includes a `food` pick from `get_food_spots`
- **To-dos**: the To-do tab (`Todo` in `lib/types.ts`: title, optional `estMinutes` (max 12h), `doBefore` day or `repeat` (daily / weekly days / monthly day, optional `time` or `partOfDay`), optional `location`, `done`, `doneOn`), saved in localStorage under `bloomsbuddy:todos` (works in the demo week too; old `due` is migrated to `doBefore` on read). No Claude calls in the form: plain controls validated by `validateTodoDraft`. Tapping a row only ticks it; the pencil edits. A ticked repeating to-do comes back on its next occurrence (`isDoneNow`). Open and repeating ones go to `/api/recommend`, where `todosForGap` keeps open one-offs plus repeating ones that come up on the gap's day in its time/part of day, and `get_todos` says whether each fits the gap's usable minutes. Claude prefers ones due soon, never suggests one that doesn't fit, and marks the pick with `todoId` (no extra pick type). The card then shows a "📝 From your to-do" badge
- **Locations on to-dos and deadlines**: both can have an optional `location` (`EventLocation`: UCL building or postcode), picked with the same `LocationPicker` as events and shown as a small 📍 badge. `get_todos` / `get_deadlines` add the trip for it (`placeTrip` in `lib/recommend/tools.ts`: `minsThere`, `minsOnToNext`, `minsAtPlace`), and a located to-do's `fitsInGap` uses `minsAtPlace`
- **Redo**: recommendations are cached per gap in Today's state. "↻ Redo" on the picks asks Claude again (loading state, then fresh picks)
- **Manual events**: on Today, the floating "+" button or a tap on an empty slot opens `EventSheet` (`app/event-form.tsx`: bottom sheet on phone, right side panel on `md+`) pre-filled with the day and time. Fields: title, type (`EventKind`: the 4 class kinds + office hours, society, personal), date, start/end (hour + minute selects, so always 24-hour), optional room, optional location (`LocationPicker`: a search box over UCL buildings and libraries, plus "Other place (postcode)" looked up via `/api/postcode`, and "No location") and "Repeats weekly". Checked in code by `validateEventDraft`. Saved in localStorage under `bloomsbuddy:events` (works in the demo week too). Tapping a manual event edits it (the whole series if weekly). Tapping a timetable class changes **that day only**: the occurrence is hidden and an edited one-off copy saved; delete just hides it. Saving one (or adding a society event) that overlaps another event first warns "Clashes with ECON0013 Microeconomics 10:00–11:00" (`lib/clashes.ts`) with "Add anyway" / "Cancel"; overlapping events sit side by side on the calendar with a ⚠️. Manual events are busy time in `findGaps`, and Claude treats them as fixed plans (`ownPlan` in the gap; added society events are left out of `get_events_in_window`): a postcode event stands in as its nearest building (travel uses its real coordinates), an event with no location takes the location of the event before it (else after, else Wilkins)
- **Chat**: the ✨ sparkle button on Today (above the "+") opens `ChatAssistant` (`app/chat-sheet.tsx`: bottom sheet on phone, right panel on `md+`). Students ask about any time, not just gaps ("what can I do Saturday 14:00–17:00?"). `POST /api/chat` (`chatReply` in `lib/recommend/chat.ts`) is built to answer in one Claude call: the next 7 days (events, own plans, free gaps), date offsets for 14 days, deadlines due in 30 days and every open to-do go straight into the prompt as compact text (`studentContext`), and Claude must base "what should I do" answers on the real deadlines and to-dos. Tools are only for extras (`get_study_spaces`, `get_food_spots`, `get_events_in_window`, `get_home`, each over a start/end window via `windowFor`, plus `get_schedule(date)` for later days). Building ids are listed once in the prompt, not as an enum in every tool. The chat has its own short prompt, `CHAT_PROMPT`, not `SYSTEM_PROMPT`. The prompt, tools and student data are prompt-cached. A typical question costs about $0.004, and the dev log prints the cost. Claude can call `propose_event` / `propose_todo` (checked by `validateEventDraft` / `validateTodoDraft`; Claude writes its reply first, and our own tool loop stops after a cards-only turn, so that's one call too): they show as cards with "Add" / "Dismiss", and nothing is saved until Add (events get the clash warning first). The conversation is session-only (`sessionStorage` key `bloomsbuddy:chat`, with a Clear button), has a typing indicator and a friendly error with Retry. No starter suggestions
 MOCK `FOOD_SPOTS` in `lib/buildings.ts` (approx coordinates, made-up queue notes). Static reference data like the buildings, so no provider

**Voice**: warm, casual, a bit cheeky. Like a friend who knows UCL's campus.

## Stack (keep it minimal)
- Next.js (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk`: `claude-sonnet-5-5` for recommendations and screenshot extraction (`MODEL` in `lib/claude-json.ts`). `FAST_MODEL` (`claude-haiku-5-5`) is defined but currently unused; Haiku 5.5 rejects a non-default `temperature`, so don't set one
- `cheerio` for scraping
- `localStorage` for user data: no database, no login
- Deployed on Vercel

## Architecture rule
Every data source sits behind a **provider interface** with a `mock` and a `real` implementation. The `DEMO_MODE` env flag switches between them (see `lib/config.ts`).
- Build against mock data first.
- **Demo mode must always keep working as a fallback.** It's ON unless `DEMO_MODE=false`, so a missing env var can't break the demo.
- If a real provider throws or times out, fall back to its mock and don't crash the page.
- Exception: society events are always scraped live, even in demo mode (it costs no API tokens). Mock events only when the student has no societies or the SU site fails.

## Time rules (important)
- Everything is **Europe/London**. Servers (Vercel) run in UTC, so never rely on the machine's local time.
- Absolute instants are stored as ISO 8601 strings **with an explicit offset**, e.g. `2026-10-16T10:00:00+01:00`.
- For display or "what day/hour is it", use `Intl.DateTimeFormat` with `timeZone: "Europe/London"`, not `Date#getHours()` and friends.
- BST ends Sun 25 Oct 2026. Until then London is `+01:00`, and after it's `+00:00`.

## Layout
- `app/`: Next.js routes and UI. Claude calls go in route handlers (server-side only). Bottom tabs (`tab-bar.tsx`): Today, To-do, Library, Societies, Deadlines
- `app/day-calendar.tsx`: the shared one-day calendar (`DayCalendar`: hour grid from 08:00–22:00, widened to fit; events placed by time, coloured by source (`EventTone`: timetable classes and their one-day edits = indigo, the student's own events = fuchsia, society-type events = orange), `KindLegend` under it; tappable gaps with 30+ usable min after travel (`findGaps`: an event inside free time splits it, and each leftover is kept only if it still has 30+ usable min); `onSlotTap` for empty space; red now line, today only; an inline panel opens under the tapped item) and the Mon–Sun `DayPills`. Today uses it for gaps and recommendations; the timetable editor (`TimetableStep` in `app/setup/setup-flow.tsx`) uses it to tap a class and edit it inline
- `lib/types.ts`: shared domain types (serialisable; they go to localStorage and into prompts)
- `lib/buildings.ts`: UCL building and hall coordinates, mock `FOOD_SPOTS`, `walkingMins()`, `travelTime()` (buildings) and `travelTimeBetween()` (any lat/lng, e.g. a postcode)
- `lib/home.ts`: the student's home in localStorage (`bloomsbuddy:home`) + `homeLocation()` for the recommend request
- `app/home-picker.tsx`: the home form, shared by `home-sheet.tsx` (Today) and the setup Home step. `lib/postcode.ts`: postcode shape check, shared with `/api/postcode`
- `lib/manual-events.ts`: manual events + hidden class occurrences in localStorage, `eventsForDay` (merges them into a day's classes), and the form's draft helpers and `validateEventDraft`. `app/event-form.tsx`: `EventSheet`
- `lib/location.ts`: the shared place model for events, to-dos and deadlines (`LocationDraft`, `isLocation`, draft helpers, `locationLabel`). `app/location-picker.tsx`: `LocationPicker`, the type-to-filter building search (`searchBuildings` in `lib/buildings.ts`, shared with the home picker, and its `PickRow`); `buildingOnly` in the timetable editor. `app/postcode-lookup.ts`: `lookupPostcode` / `resolveLocation` (client calls to `/api/postcode`)
- `lib/clashes.ts`: `findClashes` and `clashMessage`, shared by `EventSheet` and the Societies tab
- `lib/lunch.ts`: `lunchInfo(gap, dayGaps)`, the lunch rule above
- `lib/todos.ts`: the to-do list in localStorage (`bloomsbuddy:todos`), plus pure helpers shared with the API route: `isTodo`/`migrateTodo`, repeats (`occursOn`, `nextOccurrence`, `isDoneNow`, `repeatLabel`), `todosForGap`, and the form's `validateTodoDraft`
- `lib/recommend/`: Claude tool loops. `tools.ts` (the tool-result builders over a `ToolWindow`, shared by both), `recommend.ts` (`get_study_spaces`, `get_events_in_window`, `get_deadlines`, `get_food_spots`, `get_todos` when there are open to-dos, and `get_home` when a home is set), the editable `system-prompt.ts` (`SYSTEM_PROMPT` for gap picks, `CHAT_PROMPT` for chat), `chat.ts` (`/api/chat`), and `request.ts` (`parseStudentContext`, the request checks both routes share; the browser side is `lib/request-context.ts`)
- `lib/config.ts`: `isDemoMode()`
- `lib/term.ts`: `termEndKey(user)`, the end of term (the timetable's last week, else UCL's Term 1 end). The Societies tab lists events up to it
- `lib/prepare-image.ts`: shrinks a screenshot before `/api/extract` (setup and the Deadlines tab's "Re-scan Moodle screenshot")
- `lib/mock/`: one realistic student week, written as Mon 12 – Fri 16 Oct 2026 and moved to the current London week on every call (`week.ts`; at the weekend, next week)
- `lib/providers/`: provider interfaces + mocks; `societies.ts` is the real SU events provider (scraped on every request, no cache; parallel requests share one in-flight scrape per society)
- `app/library/`: the Library tab, the live UCL seat page in an iframe (`USE_IFRAME` flag; fallback card on failure)
- `lib/library-busyness.ts`: library busyness estimates (not a provider; Claude and the UI only see the level, never seat numbers)
- `lib/societies/su-site.ts`: SU website fetching, society lookup by slug, and event parsing (cheerio): `/events` cards (all upcoming events on one page) filtered to a London day range, then each in-range event's page for venue and the "Free" tag
- `lib/societies/slug.ts`: SU page link → slug (`slugFromLink`) and society name → slug. Pure, so client components can use it
- `lib/bot-check.ts`: detects bot walls (Cloudflare's "Just a moment…" etc.) and `BlockedError`
- `lib/claude-json.ts`: shared schema-constrained Claude call

## Conventions
- Durations of 60+ minutes are shown in hours and minutes, never as a big minute count: "3 hours and 12 minutes" in prose, "3h 12m" in tight labels. Use `formatDuration` / `formatDurationShort` from `lib/duration.ts`; Claude follows the same rule via the system prompt.
- Secrets live only in `.env.local` (gitignored). `ANTHROPIC_API_KEY` is server-side only and never imported into client components.
- `.env.example` documents every env var.
- Keep dependencies minimal and ask before adding new ones.

## UI rules
Follow these everywhere in the app:
- **Times are always 24-hour**: "14:00", "09:30", "09:00–11:00". Never "2pm", "9am" or "1400". Use `formatTime` / `formatTimeRange` / `formatWallTime` from `lib/london-time.ts`. Claude is told the same in the system prompt.
- **Day notes are plain and factual**: no jokes, no emojis. E.g. "Nothing scheduled today", "1 event today", "4 events, first at 09:00", "Back-to-back from 10:00 to 14:00", "Weekend, nothing scheduled". Computed from that day's events on every render by `dayNote` in `lib/day-note.ts`.
- **Delete is two taps**: the first tap turns the button red with "Tap again to delete", and it resets after 3s. No confirm dialogs or option menus. Use `DeleteButton` from `app/form-ui.tsx`. Exception: removing a society chip on the Societies tab is one tap on its ×.
- **Every view shows Monday–Sunday**, including Saturday and Sunday.

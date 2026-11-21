# Architecture

Plain HTML, CSS and JavaScript modules. No framework and no build step, so it deploys straight to GitHub Pages and is easy to change.

```
index.html              App shell: top bar, tab bar, <main id="view">, bottom-sheet <dialog>
manifest.webmanifest    PWA manifest (name, icons, standalone display, shortcuts)
sw.js                   Service worker: offline cache (bump VERSION on each release)
icons/                  App icons incl. apple-touch-icon
vendor/tesseract/       Tesseract.js 5.1.1 + English data, loaded only when scanning (Apache-2.0)
css/app.css             All styles, light + dark mode, iPhone safe areas
js/
  app.js                Hash router (#/bills, #/honeymoon/itinerary, ...) + SW registration
  store.js              Data layer: the single state object, save/load, actions, backup
  calc.js               Pure selectors: every number on screen is computed here
  ui.js                 Formatting, progress bars, toast, bottom-sheet form builder
  sample-data.js        Placeholder data for first launch
  sync.js               Google Drive sync: OAuth redirect sign-in, find/create the data file, pull-merge-push loop
  merge.js              Record-level merge of two copies of the state (per-record updatedAt, delete tombstones, resets)
  config.js             Google OAuth client ID
  icons.js              Inline SVG line icons + category colour dots
  ticket-parser.js      Rule-based reader for ticket/confirmation text (dates, times, route, price, confirmation #)
  scan.js               Screenshot scan: on-device OCR (vendored Tesseract.js), review form, match to a booking, save image to Drive
  importer.js           CSV import (bank exports or spreadsheet logs) -> spending, auto-categorised via category `match` words
  views/
    household.js        Dashboard, Bills, Spending, Income, Budget categories
    honeymoon.js        Portal overview, Itinerary, Bookings, Expenses, Trip details
    more.js             More menu, install help, backup & reset
```

## Layers

1. **Store** (`store.js`) owns the data. Views never touch localStorage; they call `upsert`, `remove`, `toggleBillPaid`, `updateTrip`. Every change stamps `updatedAt`, saves locally and re-renders.
1b. **Sync** (`sync.js` + `merge.js`) keeps the local copy and the Google Drive file in step: 1.5 s after a local edit, when the app returns to the foreground, every 60 s while open, and when the phone comes back online. Each pass downloads the Drive file, merges, uploads if anything changed, and applies the merged result locally. Deletes are kept as tombstones in `state.deleted`; "clear everything" and restores set `state.resetAt` so older copies don't bring data back. A phone that only has sample data never merges it into real shared data.
2. **Calc** (`calc.js`) is pure functions: `monthSummary`, `spendByCategory`, `groupTotals`, `upcomingBills`, `tripSummary`, `itinerary`. Charts, reports and suggestions in phase 2 reuse these instead of re-deriving numbers.
3. **Views** render HTML strings for one screen and bind events.

## Data model

| Collection | Fields |
|---|---|
| `income` | name, amount (take-home per paycheck), gross (optional), cadence (monthly, semimonthly, biweekly, weekly, yearly) |
| `categories` | name, icon, group (needs, wants, savings, debt), kind (fixed, flexible), budget, match (import keywords). `honeymoon` is a system category. |
| `bills` | name, amount, dueDay, categoryId, autopay, paid `{ 'YYYY-MM': true }` |
| `transactions` | date, amount, categoryId, note |
| `trip` | name, destination, startDate, endDate, budget, travelers |
| `tripItems` | type (flight, lodging, tour, ticket, dining, transport, other), title, status (idea, to-book, booked), date, time, endDate, location, confirmation, estCost, paid, paidDate, link, notes |
| `tripExpenses` | date, amount, kind (food, drinks, activity, transport, shopping, tips, other), note |

### Honeymoon roll-up

`honeymoonSpendInMonth(state, 'YYYY-MM')` = booking payments with `paidDate` in that month + trip expenses dated in that month. `spendByCategory` adds it to the `honeymoon` category, so it flows into the dashboard totals and "left this month".

### Monthly math

- Spent = transactions + bills marked paid + honeymoon spend for the month.
- Left this month = income − spent − bills not yet paid.

## Access

The app shows a lock screen until the device signs in with Google (project `household-cfo-515413`, Workspace ellehaushomes.com, audience Internal). Signing out revokes the token and deletes the local copy.

## Phase 2 ideas (structure is ready for these)

- Charts: monthly trend, category breakdown, honeymoon budget burn-down (feed from `calc.js`).
- Reports: monthly PDF/CSV export.
- Suggestions: flag categories trending over budget, bills to move off-cycle, savings rate targets.
- Read-only bank connection (SimpleFIN Bridge or Plaid) through a small server such as a Cloudflare Worker, since aggregator keys can't live in a static site.
- Currency conversion for spending abroad on the trip.

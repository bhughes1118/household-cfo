# Architecture

Plain HTML, CSS and JavaScript modules. No framework and no build step, so it deploys straight to GitHub Pages and is easy to change.

```
index.html              App shell: top bar, tab bar, <main id="view">, bottom-sheet <dialog>
manifest.webmanifest    PWA manifest (name, icons, standalone display, shortcuts)
sw.js                   Service worker: offline cache (bump VERSION on each release)
icons/                  App icons incl. apple-touch-icon
css/app.css             All styles, light + dark mode, iPhone safe areas
js/
  app.js                Hash router (#/bills, #/honeymoon/itinerary, ...) + SW registration
  store.js              Data layer: the single state object, save/load, actions, backup
  calc.js               Pure selectors: every number on screen is computed here
  ui.js                 Formatting, progress bars, toast, bottom-sheet form builder
  sample-data.js        Placeholder data for first launch
  views/
    household.js        Dashboard, Bills, Spending, Income, Budget categories
    honeymoon.js        Portal overview, Itinerary, Bookings, Expenses, Trip details
    more.js             More menu, install help, backup & reset
```

## Layers

1. **Store** (`store.js`) owns the data. Views never touch localStorage; they call `upsert`, `remove`, `toggleBillPaid`, `updateTrip`. Every change saves and re-renders. A future cloud sync (e.g. Supabase or Firebase so both phones share data) only needs to change this file.
2. **Calc** (`calc.js`) is pure functions: `monthSummary`, `spendByCategory`, `groupTotals`, `upcomingBills`, `tripSummary`, `itinerary`. Charts, reports and suggestions in phase 2 reuse these instead of re-deriving numbers.
3. **Views** render HTML strings for one screen and bind events.

## Data model

| Collection | Fields |
|---|---|
| `income` | name, amount, cadence (monthly, biweekly, weekly, yearly) |
| `categories` | name, icon, group (needs, wants, savings), budget. `honeymoon` is a system category. |
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

## Phase 2 ideas (structure is ready for these)

- Charts: monthly trend, category breakdown, honeymoon budget burn-down (feed from `calc.js`).
- Reports: monthly PDF/CSV export.
- Suggestions: flag categories trending over budget, bills to move off-cycle, savings rate targets.
- Shared sync across both phones (swap the storage in `store.js`).
- Recurring/automatic transactions and bank CSV import.
- Currency conversion for spending abroad on the trip.

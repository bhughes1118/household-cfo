# Household CFO

A simple household finance app (income, bills, spending, budgets) with a **Honeymoon Portal** built inside it. Runs in any browser and installs on an iPhone home screen like a regular app. Works offline.

**Live app:** https://bhughes1118.github.io/household-cfo/

## What's in phase 1

**Household CFO**
- **Home**: money left this month, income vs spent, bills still due, Needs/Wants/Savings (50/30/20 guide), budget by category, upcoming bills, recent spending, honeymoon snapshot.
- **Bills**: recurring bills with due day and autopay, tick off as paid each month.
- **Spending**: log day-to-day spending by category, filter, browse by month.
- **Income**: paychecks and other income (monthly, every 2 weeks, weekly, yearly).
- **Budget categories**: monthly limits grouped as Needs, Wants, Savings.

**Honeymoon Portal** (Honeymoon tab)
- **Overview**: countdown, paid to date, estimated total, budget, room left, cost breakdown, still-to-book list.
- **Itinerary**: day-by-day schedule built from your bookings.
- **Bookings**: flights, stays, tours, tickets, dining, transport. Status (Idea, To book, Booked), confirmation numbers, estimated cost, amount paid.
- **Expenses**: quick add during the trip. Type the amount, tap Food / Drinks / Tips / etc.
- **Scan a ticket**: pick a screenshot or photo of a ticket or confirmation. The app reads the text on the phone (no AI, no upload for reading), fills in the date, time, route, price and confirmation number, matches it to a planned booking, and saves the screenshot to the Google Drive folder.
- **Needs info flags**: bookings missing a date, time, place, cost or confirmation number are flagged.

**Design:** modelled on finance tools (Mercury, Ramp, Stripe, QuickBooks): neutral surfaces, ledger tables, tabular figures, line icons, colour only where it means something.

**How they connect:** every honeymoon payment (booking deposits by the date paid, plus on-trip expenses) rolls into the household **Honeymoon** category for that month, so it shows up in the monthly budget automatically.

## Install on iPhone

1. Open the live link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.

## Your data

Data is shared between phones through **Google Drive**: one file, `Household CFO/household-cfo-data.json`, in your Drive. Each device also keeps a local copy so the app opens instantly and works offline, and changes from both phones are merged. Setup takes about 10 minutes once: see [docs/GOOGLE_DRIVE_SETUP.md](docs/GOOGLE_DRIVE_SETUP.md).

This repo contains no personal financial data. Use **More → Backup & data** to download a backup file. The app starts with clearly marked sample data that you can clear there.

## Running locally

No build step. Serve the folder with any static server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organized and the phase 2 plan.

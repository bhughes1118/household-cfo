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

**How they connect:** every honeymoon payment (booking deposits by the date paid, plus on-trip expenses) rolls into the household **Honeymoon** category for that month, so it shows up in the monthly budget automatically.

## Install on iPhone

1. Open the live link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.

## Your data

Everything is stored on the device in the browser (localStorage). Nothing is sent to a server, and this repo contains no personal financial data. Use **More → Backup & data** to download a backup or restore one on another device. The app starts with clearly marked sample data that you can clear there.

## Running locally

No build step. Serve the folder with any static server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organized and the phase 2 plan.

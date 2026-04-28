# Billing Software

Electron-based billing and stock management app for purchases, sales, returns, ledger, raw material tracking, labour attendance, and reporting. The app stores data in SQLite through `better-sqlite3` and uses a renderer UI built with Tailwind CSS.

## What This Snapshot Covers

This repository now includes:

- Party master with India state and city lookup.
- Purchase entry with bill number, godown, discount, packing charge, transport charge, agent commission, and selling rate.
- Sales entry with bill metadata, delivery fields, packing charges, and godown-aware stock checks.
- Purchase return and sales return entry screens.
- Raw material `Product IN / OUT` tracking with stock summary and ledger view.
- Labour attendance with weekly summary grouped to the Saturday week-end.
- Party ledger with manual entries, WhatsApp sharing, and PDF export.
- Profile settings with logo upload support.
- Excel backup export plus a companion `.db` copy for restore compatibility.

## Project Structure

- `main.js` handles Electron startup, IPC handlers, PDF export, WhatsApp sharing, backup creation, and update checks.
- `preload.js` exposes safe renderer APIs.
- `renderer/index.html` defines the application pages and navigation.
- `renderer/app.js` contains the renderer logic, form handling, tables, and flow control.
- `database/db.js` creates and migrates the SQLite schema.
- `services/` contains the domain logic for parties, payments, purchases, sales, returns, raw material, labour attendance, settings, and profit/loss.

## How To Run

1. Install dependencies.
   ```bash
   npm install
   ```

2. Build the Tailwind output used by the renderer.
   ```bash
   npm run css:build
   ```

3. Start the Electron app.
   ```bash
   npm start
   ```

## Build And Development Commands

- `npm run css` watches `renderer/style.css` and writes `renderer/output.css`.
- `npm run css:build` generates a one-shot `renderer/output.css` build.
- `npm run build` packages the app with Electron Builder for Windows.
- `npm run rebuild:native` rebuilds `better-sqlite3` for the Electron runtime if the native module ABI changes.

## Data And Backup Notes

- The database path is resolved from Electron `userData` so packaged builds keep data outside the app install folder.
- Keep `RESET_USER_DATA_ON_START` disabled in `database/db.js` unless you intentionally want to wipe local data.
- Because SQLite WAL mode is used, backup logic should checkpoint with `wal_checkpoint(TRUNCATE)` before copying the database file.
- The current backup flow exports a human-readable `.xlsx` workbook and also writes a same-name `.db` companion file.

## Important Maintenance Notes

- Keep renderer actions behind IPC. If you add a new feature, update `main.js` and `preload.js` together.
- When adding a new table or column, update `database/db.js` and the relevant service query projections together.
- Keep label changes in sync between `renderer/index.html` and `renderer/app.js`.
- Tailwind CSS here uses `@tailwindcss/cli`, so the renderer output must be rebuilt through the npm scripts above.
- During Windows startup, Electron may print cache permission warnings. In this workspace they were observed during launch but were not app logic errors.

## Current Validation Snapshot

- Workspace diagnostics were clean at the time this README was written.
- The app launched successfully with `npm start` during this session.

## Quick Reference For Future Updates

- Purchase flow: bill number, party, godown, item lines, totals, and ledger sync.
- Sales flow: bill number, party, godown, delivery metadata, stock deduction, and bill detail actions.
- Returns flow: stock rollback or restoration plus ledger posting.
- Raw material flow: `Product IN / OUT`, stock summary, and transaction history.
- Labour flow: attendance rows plus Saturday week-end totals.
- Ledger flow: auto entries from payments, purchases, sales, plus manual debit and credit rows.

Keep this document updated whenever new pages, services, or ledger rules are added.
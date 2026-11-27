# Dërgesat e ditës

Antracit's daily delivery planner. It is a single-page PWA in Albanian. It plans the stops of each day, orders them into a route that returns to the depot in Prizren, opens the route in Google Maps, and tracks deliveries and payments. All devices share the data through a Supabase RPC backend that is protected by a license code.

## Run locally

```bash
npm install
npm start          # http://localhost:3000  (PORT and HOST can be set in .env)
npm run lint       # syntax-checks server.js, sw.js, the scripts, the inline app script and manifest.json
npm run backup     # saves the whole shared database to backups/ (needs POROSITE_LICENSE in .env)
npm run restore -- backups/<file>.json [--apply]   # puts back documents missing on the server
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: Antracit theme (CSS), markup and the app script |
| `sw.js` | Service worker: network-first for the app, cache-first for fonts and Leaflet, offline fallback |
| `server.js` | Express server. Serves **only** the public files listed in `PUBLIC` and sets security headers (CSP, nosniff, frame-ancestors) |
| `manifest.json`, `icon*.png`, `icon.svg` | PWA manifest and Antracit icons |
| `scripts/check.mjs` | `npm run lint` |
| `scripts/backup.mjs`, `scripts/restore.mjs` | Off-device backups of the shared database and missing-only restore |
| `supabase/history.sql` | Optional server-side history of every change and delete (run once in Supabase) |

**Every time `index.html` changes, bump `CACHE` in `sw.js`.** The new service worker then installs, and running apps reload into the new version by themselves.

If you add a public file (an image, for example), add it to `PUBLIC` in `server.js` and to `PRECACHE` in `sw.js`. If the page starts loading something from a new third-party origin, add that origin to the CSP in `server.js`.

## Theme

The look follows [antracit.net](https://antracit.net):

- **Fonts**: Urbanist for headings and Work Sans for text.
- **Colors**: brand teal `#43c0af`, anthracite `#323e49`, warm off-white `#fbfaf7` for the header, light gray for the footer.
- **Shapes**: pill-shaped buttons and inputs (35px radius) and cards with 10px corners.
- **Logo**: an inline SVG (`#lg-full`), so it stays sharp and switches to a light color in dark mode.

All colors are CSS variables in `:root` at the top of `index.html`, and dark mode overrides them. White text on teal follows the website. If you want stronger contrast outdoors, set `--onacc` to `#1f2a33`.

## How syncing works

- Each place (`places/<id>`) and each day (`days/<yyyy-mm-dd>` = `{ids, done, pay}`) is one document.
- The app keeps the last server version of every document. It is saved together with the data in one localStorage key (`dergesat`), so the two can never get out of step. A document whose local copy differs from that version has unsent changes. Those are retried, with backoff, until the server accepts them. This survives reloads and offline use.
- Before writing, the app re-reads the collection and merges field by field (stops, done marks and payments per stop). Changes made at the same time on two phones are both kept.
- The stop order is computed on the fly from positions and done marks and is never written back. Looking at a day causes no writes.
- Logging out ("Dil") removes the cached customer data from the device. Logging in with a different license starts from an empty cache.

## Data safety (after the 27 Nov incident)

On 27 Nov 2026 every place was deleted from the server by a sync bug. These rules now make that impossible, and make any loss recoverable:

- **Deleting needs a person.** A place is deleted on the server only after someone deletes it on that device. More than 3 deletions at once (after offline work) ask for confirmation first.
- **Nothing disappears on one answer.** If the server stops returning a place or a day, devices keep their copy until two complete reads, 5 s apart, agree.
- **Lost data comes back by itself.** Days are never deleted by the app, and a place listed on a day is never hard-deleted. If the server loses either, or many places vanish at once, the devices that still have them upload them again. This happens once per session; if the server still does not keep them, the app shows a warning instead of retrying forever.
- **Every device keeps a trash.** Any place removed from a device stays in its trash for 60 days. Admins open it under *Vendet → Rikthe vende të fshira* and can put places back or download a backup file. If a day lists stops whose place is missing, the day shows a red warning.
- **Garbage is never "empty".** Any server answer that is not an explicit `{"ok": true}`, such as a Wi-Fi login page, counts as an error. It is never read as "no data" or as "saved".
- **One window at a time.** If the app is opened in a second window or tab, the first one stops and shows *Hapur në një dritare tjetër*.
- **License switches keep data.** Switching to another license moves the old copy into the trash and `dergesat_prev` instead of erasing it.
- **Updates reach every phone.** When a new version is deployed, open apps reload into it as soon as no dialog is in use. Old code does not keep running.
- **Full storage is reported**, never silently ignored.

### Backups and recovery

1. **Off-device backup**: put `POROSITE_LICENSE=<admin code>` in `.env`, then run `npm run backup` (for example daily with Windows Task Scheduler). Backups go to `backups/`, which git ignores. A sharp drop in places makes the script warn and exit with code 2.
2. **Restore**: `npm run restore -- backups/<file>.json` lists what is missing on the server; add `--apply` to put it back. It never overwrites or deletes. It also accepts the file downloaded from the app.
3. **Server history** (strongest): run `supabase/history.sql` once in the Supabase SQL editor. Every changed or deleted row is copied to `kv_history`, whatever any app version does.
4. Check Supabase → Database → Backups for the plan's own daily backups.

## Recommended server-side work (Supabase)

The client cannot enforce these. They belong in the RPC functions:

1. **Roles**: the driver role is only hidden in the UI. `kv_set`/`kv_del` should reject writes the role is not allowed to make (for example, drivers editing places or a day's stop list).
2. **Atomic per-stop updates**: an RPC that sets `done[id]` / `pay[id]` inside a day document (a jsonb merge) would remove the remaining small race window between two phones.
3. **History size**: `kv_list` returns every day ever recorded. A date-range parameter would keep polling cheap as the history grows.

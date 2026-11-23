# Dërgesat e ditës

Antracit's daily delivery planner. It is a single-page PWA in Albanian. It plans the stops of each day, orders them into a route that returns to the depot in Prizren, opens the route in Google Maps, and tracks deliveries and payments. All devices share the data through a Supabase RPC backend that is protected by a license code.

## Run locally

```bash
npm install
npm start          # http://localhost:3000  (PORT and HOST can be set in .env)
npm run lint       # syntax-checks server.js, sw.js, the inline app script and manifest.json
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: Antracit theme (CSS), markup and the app script |
| `sw.js` | Service worker: network-first for the app, cache-first for fonts and Leaflet, offline fallback |
| `server.js` | Express server. Serves **only** the public files listed in `PUBLIC` and sets security headers (CSP, nosniff, frame-ancestors) |
| `manifest.json`, `icon*.png`, `icon.svg` | PWA manifest and Antracit icons |
| `scripts/check.mjs` | `npm run lint` |

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
- The app keeps the last server version of every document (`dergesat_base` in localStorage). A document whose local copy differs from that version has unsent changes. Those are retried, with backoff, until the server accepts them. This survives reloads and offline use.
- Before writing, the app re-reads the collection and merges field by field (stops, done marks and payments per stop). Changes made at the same time on two phones are both kept.
- The stop order is computed on the fly from positions and done marks and is never written back. Looking at a day causes no writes.
- Logging out ("Dil") removes the cached customer data from the device. Logging in with a different license starts from an empty cache.

## Recommended server-side work (Supabase)

The client cannot enforce these. They belong in the RPC functions:

1. **Roles**: the driver role is only hidden in the UI. `kv_set`/`kv_del` should reject writes the role is not allowed to make (for example, drivers editing places or a day's stop list).
2. **Atomic per-stop updates**: an RPC that sets `done[id]` / `pay[id]` inside a day document (a jsonb merge) would remove the remaining small race window between two phones.
3. **History size**: `kv_list` returns every day ever recorded. A date-range parameter would keep polling cheap as the history grows.

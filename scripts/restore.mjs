// Puts back documents from a backup that are MISSING on the server. It never overwrites or
// deletes anything that is there.
//
//   npm run restore -- backups/porosite-2026-11-27_0900.json            (dry run: only lists)
//   npm run restore -- backups/porosite-2026-11-27_0900.json --apply    (restores)
//   add --only=places or --only=days to limit it
//
// Also accepts the "Shkarko kopjen rezervë" file downloaded from the app.
// Needs POROSITE_LICENSE (admin code) in .env or the environment.
import { readFileSync } from 'node:fs';

try { process.loadEnvFile?.(); } catch { /* no .env */ }
const LIC = process.env.POROSITE_LICENSE;
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
if (!LIC || !file) {
  console.error('Usage: npm run restore -- <backup.json> [--apply] [--only=places|days]   (POROSITE_LICENSE must be set)');
  process.exit(1);
}
const API = 'https://kxesbwziuzyjoyobpgvw.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_WgVdMUOR7N9FgJJwz54VtA_4UAPrLuW';

async function rpc(fn, body) {
  const res = await fetch(API + fn, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lic: LIC, ...body }),
  });
  const o = await res.json().catch(() => null);
  if (!res.ok || !o || o.ok !== true) throw new Error(`${fn}: ${res.status} ${JSON.stringify(o).slice(0, 120)}`);
  return o;
}

// Backups from scripts/backup.mjs hold server rows; app downloads hold the app's own data.
const b = JSON.parse(readFileSync(file, 'utf8'));
const docs = { places: new Map(), days: new Map() };
if (Array.isArray(b.places) && b.places.length && b.places[0] && 'data' in b.places[0]) {
  for (const r of b.places) docs.places.set(String(r.id), r.data);
  for (const r of b.days || []) docs.days.set(String(r.id), r.data);
} else {
  for (const p of b.places || []) docs.places.set(String(p.id), p);
  for (const x of Object.values(b.trash || {})) if (x && x.p && !docs.places.has(String(x.p.id))) docs.places.set(String(x.p.id), x.p);
  const keys = new Set([...Object.keys(b.plans || {}), ...Object.keys(b.done || {}), ...Object.keys(b.pay || {})]);
  for (const k of keys) docs.days.set(k, { ids: (b.plans || {})[k] || [], done: (b.done || {})[k] || {}, pay: (b.pay || {})[k] || {} });
}

let total = 0;
for (const coll of ['places', 'days']) {
  if (only && only !== coll) continue;
  const have = new Set((await rpc('kv_list', { coll })).rows.map(r => String(r.id)));
  const missing = [...docs[coll].entries()].filter(([id]) => !have.has(id));
  console.log(`${coll}: ${docs[coll].size} in backup, ${have.size} on server, ${missing.length} missing`);
  for (const [id, d] of missing) {
    console.log(`  ${apply ? 'restoring' : 'would restore'} ${coll}/${id}${d && d.name ? ' ' + d.name : ''}`);
    if (apply) { await rpc('kv_set', { coll, kid: id, d }); total++; }
  }
}
console.log(apply ? `Restored ${total} documents.` : 'Dry run only. Add --apply to restore.');

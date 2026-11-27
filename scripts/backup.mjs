// Saves a complete copy of the shared database (all places and days) to backups/<date>.json.
//
//   1. Put the license code in .env (never commit it):   POROSITE_LICENSE=your-code
//   2. Run:                                              npm run backup
//
// Keeps the newest 120 backups. If the number of places dropped sharply since the previous
// backup it prints a warning, exits with code 2 and deletes nothing, so a scheduled run can alert you.
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile?.(); } catch { /* no .env */ }
const LIC = process.env.POROSITE_LICENSE;
if (!LIC) {
  console.error('Set POROSITE_LICENSE in .env (or in the environment) first.');
  process.exit(1);
}
const API = 'https://kxesbwziuzyjoyobpgvw.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_WgVdMUOR7N9FgJJwz54VtA_4UAPrLuW';
const KEEP = 120;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');

async function list(coll) {
  const res = await fetch(API + 'kv_list', {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lic: LIC, coll }),
  });
  const o = await res.json().catch(() => null);
  if (!res.ok || !o || o.ok !== true || !Array.isArray(o.rows)) {
    throw new Error(`${coll}: unexpected answer ${res.status} ${JSON.stringify(o).slice(0, 120)}`);
  }
  return o.rows;
}

const [places, days] = await Promise.all([list('places'), list('days')]);
mkdirSync(DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const file = path.join(DIR, `porosite-${stamp}.json`);
writeFileSync(file, JSON.stringify({ app: 'dergesat', saved: new Date().toISOString(), places, days }, null, 1));
console.log(`Saved ${places.length} places and ${days.length} days to ${path.relative(process.cwd(), file)}`);

const files = readdirSync(DIR).filter(f => /^porosite-.*\.json$/.test(f)).sort();
const prevFile = files.filter(f => path.join(DIR, f) !== file).pop();
if (prevFile) {
  const prev = JSON.parse(readFileSync(path.join(DIR, prevFile), 'utf8'));
  const before = prev.places.length;
  if (before >= 5 && places.length < before * 0.8) {
    console.error(`WARNING: places dropped from ${before} (${prevFile}) to ${places.length}. Check the app; restore with:`);
    console.error(`  npm run restore -- backups/${prevFile}`);
    process.exit(2);
  }
}
for (const f of files.slice(0, Math.max(0, files.length - KEEP))) unlinkSync(path.join(DIR, f));

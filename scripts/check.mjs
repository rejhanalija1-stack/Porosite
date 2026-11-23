// Syntax-checks the server, the service worker, the inline app script and the manifest.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
let failed = false;
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed = true; console.error(`FAIL ${name}\n${e.message}`); } };

for (const f of ['server.js', 'sw.js', 'scripts/check.mjs']) {
  ok(f, () => execFileSync(process.execPath, ['--check', fileURLToPath(new URL(f, root))], { stdio: 'pipe' }));
}
ok('index.html <script>', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length) throw new Error('no inline script found');
  scripts.forEach((s, i) => new vm.Script(s, { filename: `index.html#script${i + 1}` }));
});
ok('manifest.json', () => JSON.parse(read('manifest.json')));

process.exit(failed ? 1 : 0);

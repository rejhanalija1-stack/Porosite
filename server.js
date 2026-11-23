import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env if present (Node >= 20.12). Missing file or older Node: ignore.
try { process.loadEnvFile?.(); } catch { /* no .env */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Only these files are public. Everything else in the project folder
// (server.js, package.json, node_modules, .git, .env, ...) must never be served.
const PUBLIC = new Set([
  'index.html', 'manifest.json', 'sw.js', 'icon.svg',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
]);
// Always revalidated so that new versions of the app reach phones quickly.
const NO_CACHE = new Set(['index.html', 'manifest.json', 'sw.js']);

// Third-party origins the page talks to. Keep in sync with index.html / sw.js.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com",
  "connect-src 'self' https://kxesbwziuzyjoyobpgvw.supabase.co https://router.project-osrm.org https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  });
  next();
});

function serve(res, file) {
  res.set('Cache-Control', NO_CACHE.has(file) ? 'no-cache' : 'public, max-age=604800');
  if (file === 'manifest.json') res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, file));
}

app.get('/', (_req, res) => serve(res, 'index.html'));
app.get('/:file', (req, res, next) => (PUBLIC.has(req.params.file) ? serve(res, req.params.file) : next()));

app.use((_req, res) => {
  res.status(404).type('text/plain').set('Cache-Control', 'no-store').send('Not found');
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

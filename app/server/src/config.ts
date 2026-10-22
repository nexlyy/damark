import path from 'node:path'

// Everything the server takes from its environment. On the server these come
// from /etc/damark/app.env (see deploy/app.sh); in development the defaults
// keep data under app/data.

function env(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

// Scripts and the service both run from the app folder.
const root = process.cwd()

export const config = {
  port: Number(env('PORT', '8810')),
  host: env('HOST', '127.0.0.1'),
  // Where the database, photos and backups live.
  dataDir: path.resolve(env('DATA_DIR', path.join(root, 'data'))),
  // The built storefront and admin (vite build output).
  webDir: path.resolve(env('WEB_DIR', path.join(root, 'dist', 'web'))),
  // Address buyers and staff open, for links in Telegram messages.
  publicUrl: env('PUBLIC_URL', 'http://localhost:5173').replace(/\/$/, ''),
  // Behind nginx with HTTPS the session cookie is Secure.
  secureCookies: env('SECURE_COOKIES', 'false') === 'true',
  // nginx serves /media and /assets itself in production; in development the
  // app does.
  serveStatic: env('SERVE_STATIC', 'true') === 'true',
  // Background jobs: Telegram polling, Nova Poshta tracking, backups. Off in
  // tests.
  jobs: env('JOBS', 'true') === 'true',
  telegramApi: env('TELEGRAM_API', 'https://api.telegram.org'),
  novaPoshtaApi: env('NOVA_POSHTA_API', 'https://api.novaposhta.ua/v2.0/json/'),
}

export const paths = {
  db: path.join(config.dataDir, 'damark.sqlite'),
  media: path.join(config.dataDir, 'media'),
  backups: path.join(config.dataDir, 'backups'),
}

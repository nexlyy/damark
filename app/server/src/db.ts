import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export type DB = Database.Database

// Each entry runs once, in order; PRAGMA user_version remembers how far a
// database has come. Never edit an entry that has shipped: add a new one.
//
// Money: prices and order sums are whole hryvnias (INTEGER); purchase costs
// can carry kopiyky (REAL, rounded to 2 places when written).
const migrations: string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'dev')),
    password_hash TEXT NOT NULL,
    tg_user_id INTEGER UNIQUE,
    tg_username TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE trusted_devices (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE login_challenges (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  -- One-time /start payloads that tie a Telegram chat to a staff account or
  -- to an order.
  CREATE TABLE tg_links (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('user', 'order')),
    ref_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE brands (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug TEXT NOT NULL UNIQUE
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    old_price INTEGER CHECK (old_price IS NULL OR old_price >= 0),
    composition TEXT NOT NULL DEFAULT '',
    care TEXT NOT NULL DEFAULT '',
    measurements TEXT NOT NULL DEFAULT '',
    size_chart TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_new INTEGER NOT NULL DEFAULT 0,
    is_hit INTEGER NOT NULL DEFAULT 0,
    search TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    published_at TEXT
  );
  CREATE INDEX products_listing ON products (status, category_id, published_at);

  -- Photos. product_id stays NULL between upload and the first save of a new
  -- product; such leftovers are cleared after a day.
  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    review_id INTEGER,
    file TEXT NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX media_product ON media (product_id, sort);

  CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    cost REAL,
    sort INTEGER NOT NULL DEFAULT 0,
    UNIQUE (product_id, size, color)
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    telegram TEXT NOT NULL DEFAULT '',
    tg_chat_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    blacklisted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status TEXT NOT NULL CHECK (status IN
      ('new', 'paid', 'shipped', 'arrived', 'received', 'cancelled', 'refused', 'returned')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    telegram TEXT NOT NULL DEFAULT '',
    city_name TEXT NOT NULL,
    city_ref TEXT NOT NULL DEFAULT '',
    warehouse_name TEXT NOT NULL,
    warehouse_ref TEXT NOT NULL DEFAULT '',
    warehouse_kind TEXT NOT NULL DEFAULT 'branch' CHECK (warehouse_kind IN ('branch', 'postomat')),
    source TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'admin')),
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    refund INTEGER NOT NULL DEFAULT 0,
    buyer_note TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    exchange_of INTEGER REFERENCES orders(id),
    reserved_until TEXT,
    reserve_alerted INTEGER NOT NULL DEFAULT 0,
    paid_at TEXT,
    shipped_at TEXT,
    closed_at TEXT,
    ttn TEXT NOT NULL DEFAULT '',
    ttn_ref TEXT NOT NULL DEFAULT '',
    np_status TEXT NOT NULL DEFAULT '',
    np_status_code INTEGER,
    np_checked_at TEXT,
    tg_chat_id INTEGER,
    team_message_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX orders_status ON orders (status, created_at);
  CREATE INDEX orders_customer ON orders (customer_id);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    cost REAL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    returned_qty INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    supplier TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    extra_cost REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE purchase_items (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0)
  );

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reply TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Nova Poshta reference lookups (cities, branches), kept for a day.
  CREATE TABLE np_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
]

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  migrate(db)
  return db
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i])
      db.pragma(`user_version = ${i + 1}`)
    })()
  }
}

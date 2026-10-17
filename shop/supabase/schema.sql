-- DaMark: the database behind a production version of this template.
--
-- The demo keeps the same shape in the browser (src/lib/types.ts). Here it is
-- as Postgres tables for Supabase: photos go to a Storage bucket, the owner
-- signs in with Supabase Auth, and the public site can read only what is on
-- sale. Checked on plain Postgres 16 with Supabase's anon and authenticated
-- roles; not yet run on a Supabase project.

create extension if not exists pgcrypto;

-- Purchases: a bag or lot bought as one, so its payback can be counted.
create table batches (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  bought_on   date not null default current_date,
  cost        numeric(10, 2) not null default 0 check (cost >= 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create type product_status    as enum ('draft', 'available', 'reserved', 'sold');
create type product_condition as enum ('new', 'new_flaw', 'used');

create table products (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- DM-0001, what a buyer quotes
  title         text not null,
  brand         text not null default '',
  category      text not null,
  measurements  text not null default '',
  condition     product_condition not null default 'new',
  description   text not null default '',
  price         numeric(10, 2) not null check (price >= 0),
  old_price     numeric(10, 2) check (old_price >= 0),
  cost          numeric(10, 2) not null default 0 check (cost >= 0),  -- never public
  batch_id      uuid references batches on delete set null,
  status        product_status not null default 'available',
  created_at    timestamptz not null default now()
);

create table product_sizes (
  product_id  uuid not null references products on delete cascade,
  size        text not null,
  qty         int  not null default 1 check (qty >= 0),
  primary key (product_id, size)
);

-- path is the object's name in the public Storage bucket "photos".
create table product_photos (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products on delete cascade,
  path        text not null,
  position    int  not null default 0
);
create index on product_photos (product_id, position);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  phone        text unique,
  telegram     text unique,
  blacklisted  boolean not null default false,       -- refused a parcel before
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create type live_status as enum ('planned', 'live', 'done');

create table lives (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  starts_at  timestamptz not null,
  status     live_status not null default 'planned'
);

-- A lot is a product shown on a live under a number buyers call out.
create table live_lots (
  live_id     uuid not null references lives on delete cascade,
  lot_no      int  not null check (lot_no > 0),
  product_id  uuid not null references products on delete cascade,
  primary key (live_id, lot_no),
  unique (live_id, product_id)
);

create type order_status as enum (
  'new', 'awaiting_payment', 'paid', 'shipped', 'done', 'refused', 'cancelled'
);

create sequence order_number start 1001;

create table orders (
  id           uuid primary key default gen_random_uuid(),
  number       int not null unique default nextval('order_number'),
  customer_id  uuid references customers on delete set null,
  status       order_status not null default 'new',
  city         text not null default '',
  branch       text not null default '',            -- Nova Poshta branch or locker
  ttn          text not null default '',            -- Nova Poshta waybill
  live_id      uuid references lives on delete set null,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  shipped_at   timestamptz
);
create index on orders (status);
create index on orders (paid_at);

-- Title, size and prices are copied in, so an order still reads right after
-- the product is edited or deleted.
create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders on delete cascade,
  product_id  uuid references products on delete set null,
  title       text not null,
  size        text not null default '',
  price       numeric(10, 2) not null,
  cost        numeric(10, 2) not null default 0
);
create index on order_items (order_id);

create table shop_settings (
  id                boolean primary key default true check (id),   -- one row only
  shop_name         text not null default 'DaMark',
  manager_telegram  text not null default '',
  viber_phone       text not null default '',
  fop_name          text not null default '',
  iban              text not null default '',
  stock_group       text not null default '',
  reserve_hours     int  not null default 24
);
insert into shop_settings default values;

-- Access. The public site (role anon) sees products on sale, their sizes and
-- photos, and the contact settings — never purchase prices, orders or
-- customers. The owner and managers sign in (role authenticated) and may do
-- everything.

alter table batches        enable row level security;
alter table products       enable row level security;
alter table product_sizes  enable row level security;
alter table product_photos enable row level security;
alter table customers      enable row level security;
alter table lives          enable row level security;
alter table live_lots      enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table shop_settings  enable row level security;

revoke select on products from anon;
grant select (id, code, title, brand, category, measurements, condition,
              description, price, old_price, status, created_at)
  on products to anon;

revoke select on shop_settings from anon;
grant select (shop_name, manager_telegram, viber_phone, fop_name, stock_group)
  on shop_settings to anon;

create policy "site: products on sale" on products
  for select to anon using (status in ('available', 'reserved'));

create policy "site: sizes of products on sale" on product_sizes
  for select to anon using (
    exists (select 1 from products p where p.id = product_id and p.status in ('available', 'reserved'))
  );

create policy "site: photos of products on sale" on product_photos
  for select to anon using (
    exists (select 1 from products p where p.id = product_id and p.status in ('available', 'reserved'))
  );

create policy "site: contacts" on shop_settings for select to anon using (true);

do $$
declare t text;
begin
  foreach t in array array['batches', 'products', 'product_sizes', 'product_photos',
                           'customers', 'lives', 'live_lots', 'orders', 'order_items',
                           'shop_settings']
  loop
    execute format('create policy "staff: everything" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Before going live: turn off open sign-ups in Supabase Auth, so
-- "authenticated" means only the accounts the owner created.

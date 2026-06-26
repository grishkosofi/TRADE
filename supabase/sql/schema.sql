-- Supabase schema for TRADE app (MVP focused on market data, search, timeframe, currency)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  country_code text default 'US',
  currency_code text default 'USD',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.market_quotes_cache (
  symbol text primary key,
  name text,
  exchange text,
  country_code text,
  currency text,
  last_price numeric(18,6),
  change_abs numeric(18,6),
  change_pct numeric(10,4),
  volume bigint,
  market_time timestamptz,
  fetched_at timestamptz default now()
);

create table if not exists public.market_history_cache (
  id bigserial primary key,
  symbol text not null,
  timeframe text not null check (timeframe in ('1D','1M','3M','1Y')),
  point_time timestamptz not null,
  open numeric(18,6),
  high numeric(18,6),
  low numeric(18,6),
  close numeric(18,6),
  volume bigint,
  currency text,
  fetched_at timestamptz default now(),
  unique(symbol, timeframe, point_time)
);

create table if not exists public.news_cache (
  id bigserial primary key,
  symbol text,
  country_code text,
  title text not null,
  url text not null,
  source text,
  published_at timestamptz,
  summary text,
  image_url text,
  fetched_at timestamptz default now()
);

create table if not exists public.currency_rates_cache (
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18,8) not null,
  fetched_at timestamptz default now(),
  primary key (base_currency, quote_currency)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy if not exists "profiles owner select" on public.profiles
for select using (auth.uid() = id);

create policy if not exists "profiles owner insert" on public.profiles
for insert with check (auth.uid() = id);

create policy if not exists "profiles owner update" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

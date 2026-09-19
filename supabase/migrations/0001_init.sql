-- Voice Inventory - 0001_init.sql (safe to re-run)
create extension if not exists pg_trgm with schema extensions;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- profiles (one per user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default 'My Shop' check (char_length(btrim(shop_name)) between 1 and 80),
  language text not null default 'en' check (language in ('en','hi','te')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, shop_name)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'shop_name'), ''), 'My Shop'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text check (category is null or char_length(category) <= 40),
  base_unit text not null check (base_unit in ('kg','l','pcs')),
  current_qty numeric(14,3) not null default 0 check (current_qty >= 0),
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index if not exists products_owner_name_uq on public.products (owner_id, lower(btrim(name))) where archived_at is null;
create index if not exists products_owner_idx on public.products (owner_id) where archived_at is null;
create index if not exists products_name_trgm on public.products using gin (lower(name) gin_trgm_ops);

-- aliases (cheeni / పంచదార / sugar -> one product)
create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  alias text not null check (char_length(btrim(alias)) between 1 and 80),
  language text check (language is null or language in ('en','hi','te')),
  created_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade
);
create unique index if not exists aliases_owner_alias_uq on public.product_aliases (owner_id, lower(btrim(alias)));
create index if not exists aliases_product_idx on public.product_aliases (product_id);
create index if not exists aliases_trgm on public.product_aliases using gin (lower(alias) gin_trgm_ops);

-- per-product pack sizes (1 bag of sugar = 50 kg)
create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  unit text not null check (unit = lower(btrim(unit)) and char_length(unit) between 1 and 30),
  factor_to_base numeric(14,4) not null check (factor_to_base > 0),
  created_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade,
  unique (product_id, unit)
);

-- stock ledger (append-only)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null,
  type text not null check (type in ('in','out','adjust','undo')),
  delta_base numeric(14,3) not null check (delta_base <> 0),
  balance_after numeric(14,3) not null check (balance_after >= 0),
  input_qty numeric(14,3),
  input_unit text check (input_unit is null or char_length(input_unit) <= 30),
  source text not null default 'manual' check (source in ('manual','voice','text','system')),
  raw_text text check (raw_text is null or char_length(raw_text) <= 500),
  lang text check (lang is null or lang in ('en','hi','te')),
  reverses_id uuid unique references public.stock_movements(id),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 100),
  created_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade,
  check ((type = 'in' and delta_base > 0) or (type = 'out' and delta_base < 0) or type in ('adjust','undo'))
);
create unique index if not exists sm_idem_uq on public.stock_movements (owner_id, idempotency_key) where idempotency_key is not null;
create index if not exists sm_product_time_idx on public.stock_movements (product_id, created_at desc);
create index if not exists sm_owner_time_idx on public.stock_movements (owner_id, created_at desc);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products for each row execute function public.touch_updated_at();

-- atomic stock functions
-- in/out: p_qty_base = positive amount in BASE unit. adjust: p_qty_base = the NEW total quantity.
create or replace function public.apply_stock_movement(
  p_product_id uuid, p_type text, p_qty_base numeric,
  p_input_qty numeric default null, p_input_unit text default null,
  p_source text default 'manual', p_raw_text text default null,
  p_lang text default null, p_idempotency_key text default null
) returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prod public.products%rowtype;
  v_row public.stock_movements%rowtype;
  v_qty numeric(14,3);
  v_delta numeric(14,3);
  v_new numeric(14,3);
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_type not in ('in','out','adjust') then raise exception 'INVALID_TYPE'; end if;
  v_qty := round(p_qty_base, 3);
  if v_qty is null or v_qty < 0 or (p_type <> 'adjust' and v_qty = 0) then raise exception 'INVALID_QTY'; end if;

  select * into v_prod from public.products
   where id = p_product_id and owner_id = v_uid and archived_at is null
   for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if p_idempotency_key is not null then
    select * into v_row from public.stock_movements
     where owner_id = v_uid and idempotency_key = p_idempotency_key;
    if found then return v_row; end if;
  end if;

  if p_type = 'in' then v_delta := v_qty;
  elsif p_type = 'out' then v_delta := -v_qty;
  else v_delta := v_qty - v_prod.current_qty; end if;
  if v_delta = 0 then raise exception 'NO_CHANGE'; end if;

  v_new := v_prod.current_qty + v_delta;
  if v_new < 0 then
    raise exception 'INSUFFICIENT_STOCK' using detail = 'available=' || v_prod.current_qty::text;
  end if;

  insert into public.stock_movements (owner_id, product_id, type, delta_base, balance_after,
      input_qty, input_unit, source, raw_text, lang, idempotency_key)
  values (v_uid, p_product_id, p_type, v_delta, v_new,
      p_input_qty, p_input_unit, p_source, p_raw_text, p_lang, p_idempotency_key)
  returning * into v_row;

  update public.products set current_qty = v_new where id = p_product_id;
  return v_row;
end $$;

create or replace function public.undo_stock_movement(p_movement_id uuid)
returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_orig public.stock_movements%rowtype;
  v_prod public.products%rowtype;
  v_row public.stock_movements%rowtype;
  v_new numeric(14,3);
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_orig from public.stock_movements where id = p_movement_id and owner_id = v_uid;
  if not found then raise exception 'MOVEMENT_NOT_FOUND'; end if;
  if v_orig.type = 'undo' then raise exception 'CANNOT_UNDO_AN_UNDO'; end if;

  select * into v_prod from public.products where id = v_orig.product_id and owner_id = v_uid for update;
  if exists (select 1 from public.stock_movements where reverses_id = p_movement_id) then
    raise exception 'ALREADY_UNDONE';
  end if;

  v_new := v_prod.current_qty - v_orig.delta_base;
  if v_new < 0 then
    raise exception 'INSUFFICIENT_STOCK' using detail = 'available=' || v_prod.current_qty::text;
  end if;

  insert into public.stock_movements (owner_id, product_id, type, delta_base, balance_after,
      input_qty, input_unit, source, lang, reverses_id)
  values (v_uid, v_orig.product_id, 'undo', -v_orig.delta_base, v_new,
      v_orig.input_qty, v_orig.input_unit, 'system', v_orig.lang, p_movement_id)
  returning * into v_row;

  update public.products set current_qty = v_new where id = v_orig.product_id;
  return v_row;
end $$;

-- Row Level Security
alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.product_aliases  enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.stock_movements  enable row level security;

drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists own_rows on public.products;
create policy own_rows on public.products for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists own_rows on public.product_aliases;
create policy own_rows on public.product_aliases for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists own_rows on public.unit_conversions;
create policy own_rows on public.unit_conversions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists own_rows on public.stock_movements;
create policy own_rows on public.stock_movements for select to authenticated
  using (owner_id = (select auth.uid()));

-- Privileges (explicit, least-privilege)
revoke all on public.profiles, public.products, public.product_aliases,
              public.unit_conversions, public.stock_movements from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (shop_name, language) on public.profiles to authenticated;

grant select on public.products to authenticated;
grant insert (name, category, base_unit, low_stock_threshold) on public.products to authenticated;
grant update (name, category, low_stock_threshold, archived_at) on public.products to authenticated;
-- current_qty is NOT writable by clients: only the two stock functions change it.

grant select, delete on public.product_aliases to authenticated;
grant insert (product_id, alias, language), update (alias, language) on public.product_aliases to authenticated;

grant select, delete on public.unit_conversions to authenticated;
grant insert (product_id, unit, factor_to_base), update (factor_to_base) on public.unit_conversions to authenticated;

grant select on public.stock_movements to authenticated;

grant all on public.profiles, public.products, public.product_aliases,
             public.unit_conversions, public.stock_movements to service_role;

revoke execute on function public.apply_stock_movement(uuid,text,numeric,numeric,text,text,text,text,text) from public, anon;
revoke execute on function public.undo_stock_movement(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.apply_stock_movement(uuid,text,numeric,numeric,text,text,text,text,text) to authenticated;
grant execute on function public.undo_stock_movement(uuid) to authenticated;

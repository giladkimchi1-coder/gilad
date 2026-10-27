-- Binenfeld site log – schema, roles and access rules.
-- All app data lives in app.store as JSON documents addressed by a Firestore-style path
-- (e.g. projects/kbz/logs/2026-10-26), exactly like the prototype and the data/ export.
-- The table is NOT readable directly: clients go through the security-definer RPCs below,
-- which enforce per-role access and strip money fields for roles that must not see ₪ amounts.
-- Realtime: clients subscribe to public.store_ticks (one row per collection) and refetch.

create schema if not exists app;

create table if not exists app.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  name text,
  role text check (role in ('admin', 'accounting', 'foreman', 'procurement')),
  created_at timestamptz not null default now()
);

create table if not exists app.store (
  path text primary key,
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists store_col_idx on app.store (col);
create index if not exists store_image_idx on app.store ((data->>'image'));

create table if not exists public.store_ticks (
  col text primary key,
  ts timestamptz not null default now()
);

-- ---------- role helpers ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from app.profiles where user_id = auth.uid()
$$;

create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'accounting'), false)
$$;

create or replace function public.can_read(p_col text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.my_role();
begin
  if r is null then return false; end if;
  if r = 'admin' then return true; end if;
  if p_col = 'private' or p_col like 'private/%' then return r = 'accounting'; end if;
  if p_col like 'projects/%/budget' then return r = 'accounting'; end if;
  if p_col like 'projects/%/outbox' then return false; end if;
  return true;
end $$;

create or replace function public.can_write(p_col text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.my_role();
begin
  if r is null then return false; end if;
  if r = 'admin' then return true; end if;
  if r = 'accounting' then
    return p_col = 'private' or p_col like 'private/%' or p_col similar to 'projects/[^/]+/(docs|budget)';
  end if;
  if r = 'foreman' then
    return p_col = 'workers' or p_col similar to 'projects/[^/]+/(logs|tasks|docs|orders|plans)';
  end if;
  if r = 'procurement' then
    return p_col similar to 'projects/[^/]+/orders';
  end if;
  return false;
end $$;

-- Money fields hidden from foreman / procurement (docs = delivery notes & invoices).
create or replace function app.strip_money(p_col text, p_data jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_col like 'projects/%/docs' then
      (p_data - 'net' - 'total' - 'vat' - 'mismatch')
      || case when jsonb_typeof(p_data->'items') = 'array' then
           jsonb_build_object('items', coalesce((select jsonb_agg(i - 'price') from jsonb_array_elements(p_data->'items') i), '[]'::jsonb))
         else '{}'::jsonb end
    else p_data
  end
$$;

create or replace function app.money_part(p_col text, p_data jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_col like 'projects/%/docs' and p_data is not null then
    jsonb_strip_nulls(jsonb_build_object('net', p_data->'net', 'total', p_data->'total', 'vat', p_data->'vat', 'mismatch', p_data->'mismatch'))
  else '{}'::jsonb end
$$;

create or replace function app.split_path(p_path text, out col text, out id text)
language plpgsql immutable set search_path = '' as $$
declare i int;
begin
  if p_path is null or p_path !~ '^[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-.]+)+$' then
    raise exception 'bad path %', p_path;
  end if;
  i := length(p_path) - strpos(reverse(p_path), '/') + 1;
  col := left(p_path, i - 1);
  id := substr(p_path, i + 1);
end $$;

-- ---------- touch ticks ----------
create or replace function app.tick() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.store_ticks (col, ts) values (coalesce(new.col, old.col), now())
  on conflict (col) do update set ts = excluded.ts;
  return null;
end $$;
drop trigger if exists store_tick on app.store;
create trigger store_tick after insert or update or delete on app.store
  for each row execute function app.tick();

-- ---------- RPCs ----------
create or replace function public.store_list(p_col text)
returns table (id text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read(p_col) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select s.id, case when public.is_finance() then s.data else app.strip_money(s.col, s.data) end
    from app.store s where s.col = p_col;
end $$;

create or replace function public.store_get(p_path text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c text; v jsonb;
begin
  select col into c from app.split_path(p_path);
  if not public.can_read(c) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select s.data into v from app.store s where s.path = p_path;
  if v is null then return null; end if;
  return case when public.is_finance() then v else app.strip_money(c, v) end;
end $$;

create or replace function public.store_set(p_path text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c text; i text; old jsonb; v jsonb := coalesce(p_data, '{}'::jsonb);
begin
  select sp.col, sp.id into c, i from app.split_path(p_path) sp;
  if not public.can_write(c) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.is_finance() then
    select data into old from app.store where path = p_path;
    v := app.strip_money(c, v) || app.money_part(c, old);
  end if;
  insert into app.store (path, col, id, data, updated_at) values (p_path, c, i, v, now())
  on conflict (path) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.store_merge(p_path text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c text; i text; v jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  select sp.col, sp.id into c, i from app.split_path(p_path) sp;
  if not public.can_write(c) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.is_finance() then v := app.strip_money(c, v); end if;
  insert into app.store (path, col, id, data, updated_at) values (p_path, c, i, v, now())
  on conflict (path) do update set data = app.store.data || excluded.data, updated_at = now();
end $$;

create or replace function public.store_add(p_col text, p_data jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare i text := '';
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
begin
  for k in 1..20 loop i := i || substr(chars, 1 + floor(random() * 36)::int, 1); end loop;
  perform public.store_set(p_col || '/' || i, p_data);
  return i;
end $$;

create or replace function public.store_delete(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select col into c from app.split_path(p_path);
  if not public.can_write(c) then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from app.store where path = p_path;
end $$;

-- Deletes a project with all its data, including its private pay data. Admin only.
create or replace function public.store_delete_project(p_pid text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_pid !~ '^[A-Za-z0-9_\-]+$' then raise exception 'bad id'; end if;
  delete from app.store
   where path = 'projects/' || p_pid
      or col like 'projects/' || p_pid || '/%'
      or col = 'private/hours/' || p_pid
      or col = 'private/payroll/' || p_pid;
  get diagnostics n = row_count;
  return n;
end $$;

-- Photos of invoices / payroll show amounts: only finance roles may open them.
create or replace function public.can_read_asset(p_id text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_role() is null then return false; end if;
  if public.is_finance() then return true; end if;
  return not exists (
    select 1 from app.store s
     where (s.col like 'private/%' and (s.data->>'image' = p_id))
        or (s.col like 'projects/%/docs' and coalesce(s.data->>'type', '') <> 'delivery'
            and (s.data->>'image' = p_id or (s.data->'images') ? p_id))
  );
end $$;

create or replace function public.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.user_id, 'email', p.email, 'name', p.name, 'role', p.role)
  from app.profiles p where p.user_id = auth.uid()
$$;

create or replace function public.profile_names(p_ids uuid[]) returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, coalesce(p.name, p.email) from app.profiles p
  where p.user_id = any(p_ids) and public.my_role() is not null
$$;

-- ---------- new users ----------
create or replace function app.on_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.profiles (user_id, email, name, role)
  values (new.id, new.email,
          case when lower(new.email) = 'giladkimchi1@gmail.com' then 'גלעד' end,
          case when lower(new.email) = 'giladkimchi1@gmail.com' then 'admin' end)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.on_new_user();

-- ---------- grants & RLS ----------
revoke all on schema app from public, anon, authenticated;
alter table app.store enable row level security;
alter table app.profiles enable row level security;

alter table public.store_ticks enable row level security;
drop policy if exists ticks_read on public.store_ticks;
create policy ticks_read on public.store_ticks for select to authenticated using (public.can_read(col));
revoke all on public.store_ticks from anon;
grant select on public.store_ticks to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'my_role()', 'is_finance()', 'can_read(text)', 'can_write(text)',
    'store_list(text)', 'store_get(text)', 'store_set(text, jsonb)', 'store_merge(text, jsonb)',
    'store_add(text, jsonb)', 'store_delete(text)', 'store_delete_project(text)',
    'can_read_asset(text)', 'me()', 'profile_names(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'store_ticks') then
    alter publication supabase_realtime add table public.store_ticks;
  end if;
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400)
on conflict (id) do nothing;

drop policy if exists files_insert on storage.objects;
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.my_role() is not null);
-- No select policy: files are served through /blob/<id>, which checks can_read_asset().

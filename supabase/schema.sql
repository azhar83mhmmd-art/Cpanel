-- Kairoo Panel Manager — Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('reseller','admin_panel','admin_web')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login timestamptz
);

create table if not exists public.panels (
  id uuid primary key,
  created_by uuid not null,
  created_by_username text not null,
  created_by_role text not null,
  panel_name text not null,
  pterodactyl_username text not null,
  encrypted_password text not null,
  ram text not null,
  panel_url text,
  pterodactyl_user_id bigint,
  pterodactyl_server_id bigint,
  status text not null default 'processing',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists panels_created_by_idx on public.panels(created_by);
create index if not exists panels_created_at_idx on public.panels(created_at desc);

create table if not exists public.logs (
  id uuid primary key,
  user_id uuid,
  username text,
  role text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists logs_created_at_idx on public.logs(created_at desc);

create table if not exists public.settings (
  id integer primary key check (id = 1),
  domain text,
  ptla_encrypted text,
  ptlc_encrypted text,
  updated_at timestamptz,
  updated_by text
);
insert into public.settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.sessions (
  sid text primary key,
  sess jsonb not null,
  expire timestamptz not null
);
create index if not exists sessions_expire_idx on public.sessions(expire);

-- Atomic compatibility replacement used by utils/db.js.
create or replace function public.replace_kairoo_rows(p_table text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_table = 'users' then
    delete from public.users u
    where not exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'id')::uuid = u.id);
    insert into public.users (id, username, password_hash, role, status, created_at, updated_at, last_login)
    select id, username, password_hash, role, status, created_at, updated_at, last_login
    from jsonb_populate_recordset(null::public.users, p_rows)
    on conflict (id) do update set username=excluded.username, password_hash=excluded.password_hash,
      role=excluded.role, status=excluded.status, created_at=excluded.created_at,
      updated_at=excluded.updated_at, last_login=excluded.last_login;
  elsif p_table = 'panels' then
    delete from public.panels p
    where not exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'id')::uuid = p.id);
    insert into public.panels (id, created_by, created_by_username, created_by_role, panel_name,
      pterodactyl_username, encrypted_password, ram, panel_url, pterodactyl_user_id,
      pterodactyl_server_id, status, error_message, created_at)
    select id, created_by, created_by_username, created_by_role, panel_name,
      pterodactyl_username, encrypted_password, ram, panel_url, pterodactyl_user_id,
      pterodactyl_server_id, status, error_message, created_at
    from jsonb_populate_recordset(null::public.panels, p_rows)
    on conflict (id) do update set created_by=excluded.created_by, created_by_username=excluded.created_by_username,
      created_by_role=excluded.created_by_role, panel_name=excluded.panel_name,
      pterodactyl_username=excluded.pterodactyl_username, encrypted_password=excluded.encrypted_password,
      ram=excluded.ram, panel_url=excluded.panel_url, pterodactyl_user_id=excluded.pterodactyl_user_id,
      pterodactyl_server_id=excluded.pterodactyl_server_id, status=excluded.status,
      error_message=excluded.error_message, created_at=excluded.created_at;
  elsif p_table = 'logs' then
    delete from public.logs l
    where not exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'id')::uuid = l.id);
    insert into public.logs (id, user_id, username, role, action, metadata, ip_address, user_agent, created_at)
    select id, user_id, username, role, action, metadata, ip_address, user_agent, created_at
    from jsonb_populate_recordset(null::public.logs, p_rows)
    on conflict (id) do update set user_id=excluded.user_id, username=excluded.username,
      role=excluded.role, action=excluded.action, metadata=excluded.metadata,
      ip_address=excluded.ip_address, user_agent=excluded.user_agent, created_at=excluded.created_at;
  else
    raise exception 'Table tidak diizinkan: %', p_table;
  end if;
end;
$$;

revoke all on function public.replace_kairoo_rows(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_kairoo_rows(text, jsonb) to service_role;

-- Server uses the Supabase service-role key, so client-side RLS access is not needed.
alter table public.users enable row level security;
alter table public.panels enable row level security;
alter table public.logs enable row level security;
alter table public.settings enable row level security;
alter table public.sessions enable row level security;

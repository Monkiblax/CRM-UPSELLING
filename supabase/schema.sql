-- CRM UPSELLING: esquema de Supabase
-- Pégalo completo en Supabase -> SQL Editor y ejecútalo una vez en tu proyecto.
-- Luego agrega tu correo al final (sección "Acceso") para poder entrar.

-- ---------- Tabla de clientes ----------
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null default '',
  telefono        text,
  correo          text,
  importe         numeric not null default 0,
  stage           text not null default 'lead',
  fecha_cierre    text,
  notas           text,
  ord             bigint,
  clasificacion   text,
  contacto_desde  text,
  monto_pagado    numeric,
  tipo_pago       text,
  fecha_pago      text,
  programas       jsonb,
  oportunidades   jsonb,
  historial       jsonb,
  custom          jsonb,  -- valores de los campos personalizados {id_campo: valor}
  created_at      timestamptz not null default now()
);
create index if not exists clients_stage_idx on public.clients (stage);
create index if not exists clients_ord_idx on public.clients (ord);

-- ---------- Acceso: solo correos autorizados ----------
-- role = 'editor' (puede mover y editar) o 'viewer' (solo lectura).
create table if not exists public.allowed_emails (
  email text primary key,
  role  text not null default 'viewer' check (role in ('editor','viewer'))
);
alter table public.allowed_emails enable row level security;  -- sin policies: nadie la lee desde la API

-- Rol del usuario actual (solo si su correo esta confirmado y autorizado)
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select a.role
  from public.allowed_emails a
  join auth.users u on lower(u.email) = lower(a.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1
$$;
revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- ---------- Seguridad (RLS) ----------
alter table public.clients enable row level security;

drop policy if exists clients_select on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;

create policy clients_select on public.clients for select to authenticated
  using (public.app_role() is not null);
create policy clients_insert on public.clients for insert to authenticated
  with check (public.app_role() = 'editor');
create policy clients_update on public.clients for update to authenticated
  using (public.app_role() = 'editor') with check (public.app_role() = 'editor');
create policy clients_delete on public.clients for delete to authenticated
  using (public.app_role() = 'editor');

-- ---------- Configuración (etapas, listas, textos, campos personalizados) ----------
create table if not exists public.app_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_insert on public.app_settings;
drop policy if exists app_settings_update on public.app_settings;

create policy app_settings_select on public.app_settings for select to authenticated
  using (public.app_role() is not null);
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check (public.app_role() = 'editor');
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.app_role() = 'editor') with check (public.app_role() = 'editor');

-- Cambios en vivo entre usuarios
do $$ begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; end $$;

-- ---------- Agrega tu correo (cambia el ejemplo) ----------
-- insert into public.allowed_emails (email, role) values ('tu@correo.com', 'editor');

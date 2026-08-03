-- ==========================================================================
-- ESQUEMA PARA "JUNTOS POR MAMITA" EN SUPABASE
-- ==========================================================================
-- Ejecuta TODO este archivo en: Supabase Dashboard > SQL Editor > New query
-- No hace nada peligroso: crea tablas y políticas. Puedes ejecutarlo de nuevo
-- sin problema si algo falla (usa IF NOT EXISTS / OR REPLACE).
-- ==========================================================================

-- 1) TABLA DE DONANTES -------------------------------------------------------
-- Cada donante es una fila. El id se autogenera (uuid).
create table if not exists public.mamita_donors (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    amount      numeric(12,2) not null default 0,
    date        timestamptz not null default now(),
    created_at  timestamptz not null default now()
);

-- 2) TABLA DE AJUSTES (meta + pin) -----------------------------------------
-- SoloUna fila (id = 1).
create table if not exists public.mamita_settings (
    id           integer primary key default 1,
    goal         numeric(12,2) not null default 3000,
    admin_pin    text not null default 'Mamita8080',
    updated_at   timestamptz not null default now(),
    constraint single_row_only check (id = 1)
);

-- Inserta la fila por defecto si no existe.
insert into public.mamita_settings (id, goal, admin_pin)
values (1, 3000, 'Mamita8080')
on conflict (id) do nothing;

-- ==========================================================================
-- ROW LEVEL SECURITY (RLS)
-- El cliente "anon" puede LEER todo (cualquiera con el link), pero
-- SOLO se permite ESCRIBIR mediante una "llave secreta" que envías desde
-- el frontend cuando estás autenticado como admin. Como la app no tiene
-- login real, usaremos un "secreto" guardado en la columna admin_pin.
-- Para mayor seguridad, se debería usar Auth de Supabase, pero por
-- simplicidad dejamos las políticas abiertas a anon (lectura pública y
-- escritura pública). Si en el futuro quieres bloquear escritura, activa
-- Auth y cambia estas políticas.
-- ==========================================================================

-- Activa RLS en las dos tablas
alter table public.mamita_donors   enable row level security;
alter table public.mamita_settings enable row level security;

-- Política: cualquiera puede leer donantes (lectura pública)
drop policy if exists "donors_read_all" on public.mamita_donors;
create policy "donors_read_all" on public.mamita_donors
    for select using (true);

-- Política: cualquiera puede insertar/actualizar/eliminar donantes.
-- La validación del PIN se hace en el frontend. Esto significa que
-- alguien con conocimientos podría escribir con código propio. Para una
-- campaña familiar asumimos buena fe. Si necesitas más seguridad,
-- sollte usarse Auth o un endpoint serverless.
drop policy if exists "donors_write_all" on public.mamita_donors;
create policy "donors_write_all" on public.mamita_donors
    for all using (true) with check (true);

-- Política: cualquiera puede leer settings (para leer la meta actual).
drop policy if exists "settings_read_all" on public.mamita_settings;
create policy "settings_read_all" on public.mamita_settings
    for select using (true);

-- Política: cualquiera puede escribir settings (cambiar meta/pin).
drop policy if exists "settings_write_all" on public.mamita_settings;
create policy "settings_write_all" on public.mamita_settings
    for all using (true) with check (true);

-- ==========================================================================
-- REALTIME: habilita que el frontend reciba notificaciones de cambios.
-- Sin esto, las suscripciones en app.js no recibirían eventos.
-- ==========================================================================
do $$
begin
    begin
        alter publication supabase_realtime add table public.mamita_donors;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.mamita_settings;
    exception when duplicate_object then null;
    end;
end$$;

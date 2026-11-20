create schema if not exists private;

-- The migration owner sets a separate password for this role during deployment.
create role brain_forge_api login;
grant usage on schema private, public to brain_forge_api;

create table private.stage_attempts (
    id uuid primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    stage_key text not null,
    stage_version smallint not null check (stage_version > 0),
    qualities smallint[] not null check (
        array_ndims(qualities) = 1
        and array_lower(qualities, 1) = 1
        and cardinality(qualities) = 16
        and array_position(qualities, null) is null
        and 0 <= all (qualities)
        and 100 >= all (qualities)
        and 70 <= any (qualities)
    ),
    events jsonb not null default '[]'::jsonb check (
        jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 5
    ),
    started_at timestamptz not null default now(),
    finished_at timestamptz
);

create index stage_attempts_user_id_idx on private.stage_attempts (user_id);

alter table private.stage_attempts enable row level security;
revoke all on table private.stage_attempts from public, anon, authenticated, service_role;
grant select, insert on table private.stage_attempts to brain_forge_api;
grant update (events, finished_at) on table private.stage_attempts to brain_forge_api;

create policy stage_attempts_api on private.stage_attempts
    for all to brain_forge_api using (true) with check (true);

create table public.stage_progress (
    user_id uuid not null references auth.users (id) on delete cascade,
    stage_key text not null,
    best_scans smallint not null check (best_scans between 1 and 5),
    clear_count integer not null check (clear_count > 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, stage_key)
);

alter table public.stage_progress enable row level security;
revoke all on table public.stage_progress from public, anon, authenticated, service_role;
grant select on table public.stage_progress to authenticated;
grant select, insert on table public.stage_progress to brain_forge_api;
grant update (best_scans, clear_count, updated_at) on table public.stage_progress to brain_forge_api;

create policy stage_progress_read_own on public.stage_progress
    for select to authenticated using ((select auth.uid()) = user_id);

create policy stage_progress_api on public.stage_progress
    for all to brain_forge_api using (true) with check (true);

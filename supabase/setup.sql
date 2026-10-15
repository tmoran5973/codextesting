-- Run once in the SQL Editor of your chosen Supabase project.
-- These private tables/bucket are accessed only by the app's server-side secret.
begin;
create table if not exists public.coloring_workspace (
 id integer primary key check (id = 1),
 projects jsonb not null default '[]'::jsonb,
 lease text,
 lease_until timestamptz
);
insert into public.coloring_workspace(id) values(1) on conflict do nothing;
create table if not exists public.coloring_credentials (
 id integer primary key check (id = 1),
 encrypted jsonb not null
);
alter table public.coloring_workspace enable row level security;
alter table public.coloring_credentials enable row level security;
revoke all on public.coloring_workspace, public.coloring_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.coloring_workspace, public.coloring_credentials to service_role;

create or replace function public.coloring_load() returns jsonb
language sql security invoker set search_path = public as $$
 select jsonb_build_object('projects', projects, 'busy', coalesce(lease is not null and lease_until > now(), false))
 from public.coloring_workspace where id=1;
$$;
create or replace function public.coloring_acquire(requested_lease text) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
 update public.coloring_workspace set lease=requested_lease, lease_until=now()+interval '360 seconds'
 where id=1 and (lease is null or lease_until < now());
 return found;
end;
$$;
create or replace function public.coloring_save(new_projects jsonb, requested_lease text) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
 if jsonb_typeof(new_projects) <> 'array' then raise exception 'Projects must be an array'; end if;
 update public.coloring_workspace set projects=new_projects
 where id=1 and lease=requested_lease and lease_until > now();
 return found;
end;
$$;
create or replace function public.coloring_release(requested_lease text) returns void
language sql security invoker set search_path = public as $$
 update public.coloring_workspace set lease=null, lease_until=null where id=1 and lease=requested_lease;
$$;
revoke all on function public.coloring_load(), public.coloring_acquire(text), public.coloring_save(jsonb,text), public.coloring_release(text) from public, anon, authenticated;
grant execute on function public.coloring_load(), public.coloring_acquire(text), public.coloring_save(jsonb,text), public.coloring_release(text) to service_role;

-- No public bucket or browser-facing access policies are created.
insert into storage.buckets(id,name,public) values('coloring-studio-artwork','coloring-studio-artwork',false) on conflict(id) do nothing;
commit;

notify pgrst, 'reload schema';

-- Additive migration for the existing CRM database. Does not modify existing drafts/branding.
begin;
create table if not exists public.workspace_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null default 'My workspace' check (char_length(name) between 1 and 100),
 kind text not null default 'individual' check (kind in ('individual','brokerage')),
 updated_at timestamptz not null default now()
);
create table if not exists public.property_pages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 published boolean not null default false,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists property_pages_owner_idx on public.property_pages(user_id);
alter table public.workspace_settings enable row level security;
alter table public.property_pages enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='workspace_settings' and policyname='workspace_owner') then
 create policy workspace_owner on public.workspace_settings for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='property_pages' and policyname='property_owner_read') then
 create policy property_owner_read on public.property_pages for select to authenticated using ((select auth.uid())=user_id);
 create policy property_public_read on public.property_pages for select to anon,authenticated using (published=true);
 create policy property_owner_insert on public.property_pages for insert to authenticated with check ((select auth.uid())=user_id);
 create policy property_owner_update on public.property_pages for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
 create policy property_owner_delete on public.property_pages for delete to authenticated using ((select auth.uid())=user_id);
 end if;
end $$;
grant select,insert,update,delete on public.workspace_settings,public.property_pages to authenticated;
revoke all on public.workspace_settings from anon;
grant select on public.property_pages to anon;
-- All property payload fields are PUBLIC when published. Never store private notes/client data here.
create or replace function public.touch_workspace_properties() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists touch_workspace_settings on public.workspace_settings;
create trigger touch_workspace_settings before update on public.workspace_settings for each row execute function public.touch_workspace_properties();
drop trigger if exists touch_property_pages on public.property_pages;
create trigger touch_property_pages before update on public.property_pages for each row execute function public.touch_workspace_properties();
commit;

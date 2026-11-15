-- Run once in a new Supabase project's SQL Editor.
begin;
create table public.social_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index social_drafts_user_id_idx on public.social_drafts(user_id);
create table public.brand_kits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '', website text not null default '',
 color text not null default '#235e49' check (color ~ '^#[0-9a-fA-F]{6}$'),
 updated_at timestamptz not null default now()
);
alter table public.social_drafts enable row level security;
alter table public.brand_kits enable row level security;
create policy drafts_select on public.social_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy drafts_insert on public.social_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy drafts_update on public.social_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy drafts_delete on public.social_drafts for delete to authenticated using ((select auth.uid()) = user_id);
create policy brand_select on public.brand_kits for select to authenticated using ((select auth.uid()) = user_id);
create policy brand_insert on public.brand_kits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy brand_update on public.brand_kits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.social_drafts to authenticated;
grant select, insert, update on public.brand_kits to authenticated;
revoke all on public.social_drafts, public.brand_kits from anon;
create function public.touch_social_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger touch_draft before update on public.social_drafts for each row execute function public.touch_social_updated_at();
create trigger touch_brand before update on public.brand_kits for each row execute function public.touch_social_updated_at();
commit;

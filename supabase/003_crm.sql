-- Additive CRM migration. Run in your EXISTING Supabase project.
begin;
create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 full_name text not null check (char_length(full_name) between 1 and 150),
 email text not null default '', phone text not null default '',
 contact_type text not null default 'Buyer' check (contact_type in ('Buyer','Seller','Buyer & seller','Agent','Service provider','Other')),
 stage text not null default 'New' check (stage in ('New','Contacted','Qualified','Active','Under contract','Closed','Lost')),
 source text not null default '', preferred_area text not null default '',
 budget numeric(15,2) check (budget>=0), assigned_to text not null default '',
 tags text[] not null default '{}',
 communication_consent text not null default 'Unknown' check (communication_consent in ('Unknown','Opted in','Opted out')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists crm_contacts_owner_idx on public.crm_contacts(user_id);
create unique index if not exists crm_contacts_owner_email_unique on public.crm_contacts(user_id,lower(email)) where email<>'';
create index if not exists crm_contacts_stage_idx on public.crm_contacts(user_id,stage);
create table if not exists public.crm_notes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null references public.crm_contacts(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 10000),
 activity_type text not null default 'Note' check (activity_type in ('Note','Call','Email','Meeting')),
 created_at timestamptz not null default now()
);
create index if not exists crm_notes_contact_idx on public.crm_notes(contact_id);
create table if not exists public.crm_tasks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid references public.crm_contacts(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 250),
 due_date date, completed boolean not null default false,
 priority text not null default 'Normal' check (priority in ('Normal','High')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists crm_tasks_owner_due_idx on public.crm_tasks(user_id,due_date);
alter table public.crm_contacts enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;
-- Idempotent policies, with linked-contact ownership enforced on every write.
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='crm_contacts' and policyname='crm_contact_owner') then
 create policy crm_contact_owner on public.crm_contacts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='crm_notes' and policyname='crm_note_owner') then
 create policy crm_note_owner on public.crm_notes for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and exists(select 1 from public.crm_contacts c where c.id=contact_id and c.user_id=(select auth.uid())));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='crm_tasks' and policyname='crm_task_owner') then
 create policy crm_task_owner on public.crm_tasks for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and (contact_id is null or exists(select 1 from public.crm_contacts c where c.id=contact_id and c.user_id=(select auth.uid()))));
 end if;
end $$;
grant select,insert,update,delete on public.crm_contacts,public.crm_notes,public.crm_tasks to authenticated;
revoke all on public.crm_contacts,public.crm_notes,public.crm_tasks from anon;
create or replace function public.touch_crm_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
drop trigger if exists touch_crm_contacts on public.crm_contacts;
create trigger touch_crm_contacts before update on public.crm_contacts for each row execute function public.touch_crm_updated_at();
drop trigger if exists touch_crm_tasks on public.crm_tasks;
create trigger touch_crm_tasks before update on public.crm_tasks for each row execute function public.touch_crm_updated_at();
commit;

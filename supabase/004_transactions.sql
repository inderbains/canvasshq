-- Run after migrations 001–003. Assign reviewers using SQL as project owner.
begin;
create table if not exists public.transaction_reviewers(agent_id uuid primary key references auth.users(id),admin_id uuid not null references auth.users(id),check(agent_id<>admin_id));
alter table public.transaction_reviewers enable row level security;
create policy reviewer_read on public.transaction_reviewers for select to authenticated using(auth.uid() in (agent_id,admin_id));
grant select on public.transaction_reviewers to authenticated;
create table public.deal_files(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('Listing','Sale')),address text not null check(length(trim(address))>0),client_name text not null default '',mls_number text not null default '',
 price numeric(15,2) check(price>=0),sale_price numeric(15,2) check(sale_price>=0),listing_date date,subject_date date,completion_date date,
 notes text not null default '',review_status text not null default 'Draft' check(review_status in ('Draft','Submitted','Changes requested','Approved')),review_notes text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index on public.deal_files(user_id);
create table public.deal_documents(id uuid primary key default gen_random_uuid(),deal_id uuid not null references public.deal_files(id),name text not null,path text unique not null,created_at timestamptz not null default now());
create function public.can_review_deal(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.transaction_reviewers where agent_id=owner_id and admin_id=auth.uid()) $$;
create function public.guard_deal_update() returns trigger language plpgsql set search_path='' as $$ begin
 if auth.uid()=old.user_id then
  if old.review_status not in ('Draft','Changes requested') then raise exception 'Submitted files are locked pending review'; end if;
  if new.review_status not in ('Draft','Submitted','Changes requested') or new.review_notes is distinct from old.review_notes then raise exception 'Only an assigned admin can review'; end if;
  if new.review_status='Submitted' and not exists(select 1 from public.transaction_reviewers where agent_id=old.user_id) then raise exception 'No back-office admin assigned'; end if;
  if new.review_status='Submitted' and not exists(select 1 from public.deal_documents where deal_id=old.id) then raise exception 'Attach at least one document before submission'; end if;
 else
  if not public.can_review_deal(old.user_id) or old.review_status<>'Submitted' or new.review_status not in ('Approved','Changes requested') then raise exception 'Review not permitted'; end if;
  if (to_jsonb(new)-'review_status'-'review_notes'-'updated_at') is distinct from (to_jsonb(old)-'review_status'-'review_notes'-'updated_at') then raise exception 'Reviewers cannot alter agent details'; end if;
 end if;
 if new.user_id<>old.user_id then raise exception 'Owner cannot change'; end if;
 new.updated_at=now();return new;end $$;
create trigger deal_update before update on public.deal_files for each row execute function public.guard_deal_update();
alter table public.deal_files enable row level security;
alter table public.deal_documents enable row level security;
create policy deal_read on public.deal_files for select to authenticated using(user_id=auth.uid() or (review_status<>'Draft' and public.can_review_deal(user_id)));
create policy deal_insert on public.deal_files for insert to authenticated with check(user_id=auth.uid() and review_status='Draft' and review_notes='');
create policy deal_update on public.deal_files for update to authenticated using(user_id=auth.uid() or public.can_review_deal(user_id)) with check(user_id=auth.uid() or public.can_review_deal(user_id));
create policy document_read on public.deal_documents for select to authenticated using(exists(select 1 from public.deal_files d where d.id=deal_id));
create policy document_insert on public.deal_documents for insert to authenticated with check(exists(select 1 from public.deal_files d where d.id=deal_id and d.user_id=auth.uid() and d.review_status in ('Draft','Changes requested')) and path like auth.uid()::text||'/'||deal_id::text||'/%');
grant select,insert,update on public.deal_files to authenticated;
grant select,insert on public.deal_documents to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('transaction-files','transaction-files',false,20971520,array['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']) on conflict(id) do nothing;
create policy transaction_upload on storage.objects for insert to authenticated with check(bucket_id='transaction-files' and exists(select 1 from public.deal_files d where d.user_id=auth.uid() and name like auth.uid()::text||'/'||d.id::text||'/%' and d.review_status in ('Draft','Changes requested')));
create policy transaction_download on storage.objects for select to authenticated using(bucket_id='transaction-files' and exists(select 1 from public.deal_documents f join public.deal_files d on d.id=f.deal_id where f.path=storage.objects.name));
commit;
-- Configure each agent/reviewer pair (UUIDs from Authentication > Users):
-- insert into public.transaction_reviewers(agent_id,admin_id) values ('AGENT_UUID','ADMIN_UUID');

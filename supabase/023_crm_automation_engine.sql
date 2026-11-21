-- RealVolt CRM Automation Engine v1 / 2026-11-19
-- Additive migration. Requires 003_crm.sql. Do not run in production without a backup.
-- Agent-owner scoped. NO external email or SMS sending, NO financial actions.
begin;

create table if not exists public.rv_auto_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 100),
  trigger_type text not null check (trigger_type in ('contact_created','stage_changed')),
  trigger_stage text check (trigger_stage is null or trigger_stage in ('New','Contacted','Qualified','Active','Under contract','Closed','Lost')),
  trigger_contact_type text check (trigger_contact_type is null or trigger_contact_type in ('Buyer','Seller','Buyer & seller','Agent','Service provider','Other')),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rv_auto_stage_trigger check (trigger_type = 'stage_changed' or trigger_stage is null)
);
create index if not exists rv_auto_workflow_match on public.rv_auto_workflows(user_id,trigger_type,enabled);

create table if not exists public.rv_auto_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null references public.rv_auto_workflows(id) on delete cascade,
  position integer not null check (position between 1 and 30),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 525600),
  action_type text not null check (action_type in ('create_task','add_note','draft_email','wait')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object' and pg_column_size(config) <= 8192),
  created_at timestamptz not null default now(),
  unique(workflow_id,position)
);
create index if not exists rv_auto_steps_order on public.rv_auto_steps(workflow_id,position);

create table if not exists public.rv_auto_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null references public.rv_auto_workflows(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  trigger_type text not null,
  status text not null default 'running' check (status in ('running','completed','stopped','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists rv_auto_runs_owner on public.rv_auto_runs(user_id,started_at desc);
create index if not exists rv_auto_runs_contact on public.rv_auto_runs(contact_id);

create table if not exists public.rv_auto_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.rv_auto_runs(id) on delete cascade,
  step_id uuid not null references public.rv_auto_steps(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  completed_at timestamptz,
  result_text text not null default '',
  last_error text,
  created_at timestamptz not null default now(),
  unique(run_id,step_id)
);
create index if not exists rv_auto_jobs_due on public.rv_auto_jobs(scheduled_for) where status in ('pending','processing');
create index if not exists rv_auto_jobs_owner on public.rv_auto_jobs(user_id,created_at desc);

-- Existing CRM actions get an idempotency key. Multiple NULLs are allowed.
alter table public.crm_tasks add column if not exists rv_auto_job_id uuid;
alter table public.crm_notes add column if not exists rv_auto_job_id uuid;
create unique index if not exists crm_tasks_automation_idempotency on public.crm_tasks(rv_auto_job_id);
create unique index if not exists crm_notes_automation_idempotency on public.crm_notes(rv_auto_job_id);

create table if not exists public.rv_auto_email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  job_id uuid not null unique references public.rv_auto_jobs(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 250),
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'draft' check (status in ('draft','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists rv_auto_drafts_owner on public.rv_auto_email_drafts(user_id,created_at desc);

-- RLS: each agent only views/edits their own workflows. Runs/jobs are backend-owned.
alter table public.rv_auto_workflows enable row level security;
alter table public.rv_auto_steps enable row level security;
alter table public.rv_auto_runs enable row level security;
alter table public.rv_auto_jobs enable row level security;
alter table public.rv_auto_email_drafts enable row level security;

create policy rv_auto_workflow_select on public.rv_auto_workflows for select to authenticated using (user_id=(select auth.uid()));
create policy rv_auto_workflow_insert on public.rv_auto_workflows for insert to authenticated with check (user_id=(select auth.uid()));
create policy rv_auto_workflow_update on public.rv_auto_workflows for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy rv_auto_step_select on public.rv_auto_steps for select to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.rv_auto_workflows w where w.id=workflow_id and w.user_id=(select auth.uid())));
create policy rv_auto_step_insert on public.rv_auto_steps for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.rv_auto_workflows w where w.id=workflow_id and w.user_id=(select auth.uid()) and not w.enabled));
create policy rv_auto_step_update on public.rv_auto_steps for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(select 1 from public.rv_auto_workflows w where w.id=workflow_id and w.user_id=(select auth.uid()) and not w.enabled));
create policy rv_auto_step_delete on public.rv_auto_steps for delete to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.rv_auto_workflows w where w.id=workflow_id and w.user_id=(select auth.uid()) and not w.enabled));
create policy rv_auto_runs_view on public.rv_auto_runs for select to authenticated using (user_id=(select auth.uid()));
create policy rv_auto_jobs_view on public.rv_auto_jobs for select to authenticated using (user_id=(select auth.uid()));
create policy rv_auto_drafts_view on public.rv_auto_email_drafts for select to authenticated using (user_id=(select auth.uid()));

grant select,insert,update on public.rv_auto_workflows to authenticated;
grant select,insert,update,delete on public.rv_auto_steps to authenticated;
grant select on public.rv_auto_runs,public.rv_auto_jobs to authenticated;
grant select on public.rv_auto_email_drafts to authenticated;
grant all on public.rv_auto_workflows,public.rv_auto_steps,public.rv_auto_runs,public.rv_auto_jobs,public.rv_auto_email_drafts to service_role;
revoke all on public.rv_auto_workflows,public.rv_auto_steps,public.rv_auto_runs,public.rv_auto_jobs,public.rv_auto_email_drafts from anon;

-- Validate step ownership even for service-role writes, avoiding cross-owner steps.
create or replace function public.rv_auto_validate_step()
returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.rv_auto_workflows w where w.id=new.workflow_id and w.user_id=new.user_id) then
   raise exception 'Automation step must belong to same owner as workflow';
 end if;
 return new;
end $$;
drop trigger if exists rv_auto_validate_step_owner on public.rv_auto_steps;
create trigger rv_auto_validate_step_owner before insert or update on public.rv_auto_steps
for each row execute function public.rv_auto_validate_step();

-- Enroll contact only for NEW events. Enabling a workflow never backfills old contacts.
create or replace function public.rv_auto_on_contact_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  trigger_name text;
  workflow_record record;
  first_step_id uuid;
  first_step_delay integer;
  created_run uuid;
begin
  if tg_op='INSERT' then
    trigger_name:='contact_created';
  elsif old.stage is distinct from new.stage then
    trigger_name:='stage_changed';
  else
    return new;
  end if;
  for workflow_record in
    select w.id from public.rv_auto_workflows w
    where w.user_id=new.user_id and w.enabled=true and w.trigger_type=trigger_name
      and (w.trigger_stage is null or w.trigger_stage=new.stage)
      and (w.trigger_contact_type is null or w.trigger_contact_type=new.contact_type)
  loop
    select s.id,s.delay_minutes into first_step_id,first_step_delay from public.rv_auto_steps s
      where s.workflow_id=workflow_record.id and s.user_id=new.user_id
      order by s.position limit 1;
    if first_step_id is not null then
      insert into public.rv_auto_runs(user_id,workflow_id,contact_id,trigger_type)
      values (new.user_id,workflow_record.id,new.id,trigger_name) returning id into created_run;
      insert into public.rv_auto_jobs(user_id,run_id,step_id,scheduled_for)
      values(new.user_id,created_run,first_step_id,now()+make_interval(mins=>first_step_delay));
    end if;
    first_step_id:=null; first_step_delay:=null;
  end loop;
  return new;
end $$;
drop trigger if exists rv_auto_new_contact on public.crm_contacts;
create trigger rv_auto_new_contact after insert or update of stage on public.crm_contacts
for each row execute function public.rv_auto_on_contact_change();

-- Claim due jobs using a short lease. SKIP LOCKED prevents two workers claiming one job.
create or replace function public.rv_auto_claim_due_jobs(p_limit integer default 10)
returns table(job_id uuid) language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Server credentials required'; end if;
  return query
  with claimed as (
    select j.id from public.rv_auto_jobs j
    where (j.status='pending' and j.scheduled_for<=now())
       or (j.status='processing' and j.locked_at<now()-interval '5 minutes')
    order by j.scheduled_for,j.id limit least(greatest(p_limit,1),25) for update skip locked
  )
  update public.rv_auto_jobs j set status='processing',locked_at=now(),attempts=j.attempts+1
  from claimed c where j.id=c.id returning j.id;
end $$;

-- Advance one step atomically, or complete run. Idempotent RPC call.
create or replace function public.rv_auto_finish_job(p_job_id uuid,p_result text default '')
returns void language plpgsql security definer set search_path='' as $$
declare
  j record;
  r record;
  current_position integer;
  next_step record;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Server credentials required'; end if;
  select * into j from public.rv_auto_jobs where id=p_job_id for update;
  if not found or j.status <> 'processing' then return; end if;
  select * into r from public.rv_auto_runs where id=j.run_id for update;
  select position into current_position from public.rv_auto_steps where id=j.step_id;
  update public.rv_auto_jobs set status='completed', completed_at=now(),locked_at=null,result_text=left(p_result,500) where id=p_job_id;
  select id,delay_minutes into next_step from public.rv_auto_steps
    where workflow_id=r.workflow_id and position>current_position order by position limit 1;
  if next_step.id is not null and r.status='running' then
    insert into public.rv_auto_jobs(user_id,run_id,step_id,scheduled_for)
    values(r.user_id,r.id,next_step.id,now()+make_interval(mins=>next_step.delay_minutes))
    on conflict(run_id,step_id) do nothing;
  else
    update public.rv_auto_runs set status='completed',finished_at=now() where id=r.id and status='running';
  end if;
end $$;

create or replace function public.rv_auto_abort_job(p_job_id uuid,p_reason text,p_permanent boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Server credentials required'; end if;
  select * into j from public.rv_auto_jobs where id=p_job_id for update;
  if not found or j.status <> 'processing' then return; end if;
  if p_permanent then
    update public.rv_auto_jobs set status='skipped',last_error=left(p_reason,600),locked_at=null,completed_at=now() where id=p_job_id;
    update public.rv_auto_runs set status='stopped',finished_at=now() where id=j.run_id and status='running';
  elsif j.attempts>=5 then
    update public.rv_auto_jobs set status='failed',last_error=left(p_reason,600),locked_at=null where id=p_job_id;
    update public.rv_auto_runs set status='failed',finished_at=now() where id=j.run_id and status='running';
  else
    update public.rv_auto_jobs set status='pending',last_error=left(p_reason,600),locked_at=null,
      scheduled_for=now() + make_interval(mins=>(1 << least(j.attempts,6))) where id=p_job_id;
  end if;
end $$;

revoke all on function public.rv_auto_claim_due_jobs(integer) from public,anon,authenticated;
revoke all on function public.rv_auto_finish_job(uuid,text) from public,anon,authenticated;
revoke all on function public.rv_auto_abort_job(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.rv_auto_claim_due_jobs(integer) to service_role;
grant execute on function public.rv_auto_finish_job(uuid,text) to service_role;
grant execute on function public.rv_auto_abort_job(uuid,text,boolean) to service_role;
revoke all on function public.rv_auto_on_contact_change() from public,anon,authenticated;
revoke all on function public.rv_auto_validate_step() from public,anon,authenticated;

commit;

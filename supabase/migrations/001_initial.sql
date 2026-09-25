-- CanvassHQ v0.1 multi-tenant schema
-- Run this in Supabase SQL Editor on a new project.

create extension if not exists pgcrypto;

create type public.org_role as enum ('owner','admin','coordinator','team_lead','canvasser','viewer');
create type public.canvass_outcome as enum ('no_answer','contacted','refused','follow_up','completed');
create type public.invitation_status as enum ('pending','accepted','failed','revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  plan text not null default 'trial',
  subscription_status text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'canvasser',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (organization_id, email)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  election_type text,
  election_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  jurisdiction text,
  source text,
  boundary_geojson jsonb,
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  district_id uuid references public.districts(id) on delete set null,
  source text not null,
  source_object_id text not null,
  house_number integer,
  road_name text,
  full_address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  municipal_status text,
  address_type text,
  lot_link bigint,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, campaign_id, source_object_id)
);

create index addresses_campaign_idx on public.addresses(campaign_id);
create index addresses_road_idx on public.addresses(campaign_id, road_name, house_number);
create index addresses_assigned_idx on public.addresses(campaign_id, assigned_to);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  boundary_geojson jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.territory_addresses (
  territory_id uuid not null references public.territories(id) on delete cascade,
  address_id uuid not null references public.addresses(id) on delete cascade,
  primary key (territory_id, address_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(team_id, user_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  territory_id uuid references public.territories(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'assigned',
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.canvass_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  address_id uuid not null references public.addresses(id) on delete cascade,
  canvasser_user_id uuid not null references auth.users(id),
  outcome public.canvass_outcome not null,
  notes text check (char_length(notes) <= 2000),
  contact_name text,
  contact_phone text,
  contact_email text,
  consent_to_contact boolean not null default false,
  follow_up_requested boolean not null default false,
  visited_at timestamptz not null default now()
);

create index canvass_visits_address_idx on public.canvass_visits(address_id, visited_at desc);
create index canvass_visits_campaign_idx on public.canvass_visits(campaign_id, visited_at desc);
create index canvass_visits_user_idx on public.canvass_visits(canvasser_user_id, visited_at desc);

create table public.activity_logs (
  id bigint generated by default as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helpers used by tenant RLS.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_org_role(org_id uuid, roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(roles)
  );
$$;

-- Profile row for every Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

-- Convenience directory and latest door status views. Security invoker preserves RLS.
create or replace view public.organization_member_directory
with (security_invoker = true)
as
select m.organization_id, m.user_id, p.email, p.display_name, m.role, m.is_active, m.created_at
from public.organization_members m
left join public.profiles p on p.id = m.user_id;

create or replace view public.address_status_view
with (security_invoker = true)
as
select
  a.*,
  latest.outcome as latest_outcome
from public.addresses a
left join lateral (
  select v.outcome
  from public.canvass_visits v
  where v.address_id = a.id
  order by v.visited_at desc
  limit 1
) latest on true;

-- Enable RLS.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.campaigns enable row level security;
alter table public.districts enable row level security;
alter table public.addresses enable row level security;
alter table public.territories enable row level security;
alter table public.territory_addresses enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.assignments enable row level security;
alter table public.canvass_visits enable row level security;
alter table public.activity_logs enable row level security;
alter table public.platform_admins enable row level security;

-- Profiles: users can see themselves and people who share at least one organization.
create policy "profiles self or shared org read" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1
    from public.organization_members me
    join public.organization_members them on them.organization_id = me.organization_id
    where me.user_id = auth.uid() and me.is_active = true and them.user_id = profiles.id
  )
);
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Organizations.
create policy "org member read" on public.organizations for select to authenticated using (public.is_org_member(id) or created_by = auth.uid());
create policy "authenticated create org" on public.organizations for insert to authenticated with check (created_by = auth.uid());
create policy "owner update org" on public.organizations for update to authenticated using (public.has_org_role(id, array['owner']::public.org_role[]));

-- Memberships.
create policy "membership directory by role" on public.organization_members for select to authenticated using (
  user_id = auth.uid()
  or public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[])
);
create policy "creator can establish owner or admins can add" on public.organization_members for insert to authenticated with check (
  (
    user_id = auth.uid() and role = 'owner' and exists (
      select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid()
    )
  )
  or public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
);
create policy "owner admin update memberships" on public.organization_members for update to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "owner admin delete memberships" on public.organization_members for delete to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Invitations.
create policy "owner admin read invites" on public.organization_invitations for select to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "owner admin manage invites" on public.organization_invitations for all to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Campaigns and districts.
create policy "member read campaigns" on public.campaigns for select to authenticated using (public.is_org_member(organization_id));
create policy "manager create campaigns" on public.campaigns for insert to authenticated with check (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));
create policy "manager update campaigns" on public.campaigns for update to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));
create policy "member read districts" on public.districts for select to authenticated using (public.is_org_member(organization_id));
create policy "manager create districts" on public.districts for insert to authenticated with check (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));
create policy "manager update districts" on public.districts for update to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));

-- Address points.
create policy "role scoped address read" on public.addresses for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead','viewer']::public.org_role[])
  or (public.has_org_role(organization_id, array['canvasser']::public.org_role[]) and assigned_to = auth.uid())
);
create policy "manager modify addresses" on public.addresses for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));

-- Territories, teams, assignments.
create policy "member read territories" on public.territories for select to authenticated using (public.is_org_member(organization_id));
create policy "field managers modify territories" on public.territories for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[]));
create policy "member read teams" on public.teams for select to authenticated using (public.is_org_member(organization_id));
create policy "field managers modify teams" on public.teams for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));
create policy "member read assignments" on public.assignments for select to authenticated using (public.is_org_member(organization_id));
create policy "field managers modify assignments" on public.assignments for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[]));

-- Join tables inherit access through parent organization/campaign relationships.
create policy "member read territory addresses" on public.territory_addresses for select to authenticated using (
  exists (select 1 from public.territories t where t.id = territory_id and public.is_org_member(t.organization_id))
);
create policy "field managers modify territory addresses" on public.territory_addresses for all to authenticated using (
  exists (select 1 from public.territories t where t.id = territory_id and public.has_org_role(t.organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[]))
) with check (
  exists (select 1 from public.territories t where t.id = territory_id and public.has_org_role(t.organization_id, array['owner','admin','coordinator','team_lead']::public.org_role[]))
);
create policy "member read team members" on public.team_members for select to authenticated using (
  exists (select 1 from public.teams t where t.id = team_id and public.is_org_member(t.organization_id))
);
create policy "managers modify team members" on public.team_members for all to authenticated using (
  exists (select 1 from public.teams t where t.id = team_id and public.has_org_role(t.organization_id, array['owner','admin','coordinator']::public.org_role[]))
) with check (
  exists (select 1 from public.teams t where t.id = team_id and public.has_org_role(t.organization_id, array['owner','admin','coordinator']::public.org_role[]))
);

-- Visits: all org members can read; canvassing roles can create their own record.
create policy "role scoped visit read" on public.canvass_visits for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead','viewer']::public.org_role[])
  or (public.has_org_role(organization_id, array['canvasser']::public.org_role[]) and canvasser_user_id = auth.uid())
);
create policy "canvasser create own visits" on public.canvass_visits for insert to authenticated with check (
  canvasser_user_id = auth.uid()
  and public.has_org_role(organization_id, array['owner','admin','coordinator','team_lead','canvasser']::public.org_role[])
  and exists (select 1 from public.addresses a where a.id = address_id and a.organization_id = organization_id and a.campaign_id = campaign_id)
);
create policy "manager update visits" on public.canvass_visits for update to authenticated using (public.has_org_role(organization_id, array['owner','admin','coordinator']::public.org_role[]));

-- Logs are visible to organization managers; writes normally use server/service role.
create policy "managers read logs" on public.activity_logs for select to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Platform admins are intentionally not exposed through client-side RLS.

-- Helpful grants for views.
grant select on public.organization_member_directory to authenticated;
grant select on public.address_status_view to authenticated;

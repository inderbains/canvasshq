# CanvassHQ v0.1

A multi-tenant door-to-door canvassing SaaS starter built with Next.js 16, Supabase Auth/Postgres, Leaflet and official public GIS sources.

## What is already included

- Multi-tenant organizations: every customer has a private workspace.
- Owner, Admin, Coordinator, Team Lead, Canvasser and Viewer roles.
- New self-serve customers become the Owner of the organization they create.
- Email invitations through Supabase Auth.
- Campaign and district structure.
- Surrey North 2024 provincial riding boundary from DataBC's 2023 redistribution layer.
- City of Surrey Address Points importer.
- Import logic bypasses the ArcGIS 2,000-record response limit by requesting Object IDs and downloading in chunks.
- Boundary filtering: only address points inside Surrey North are stored for that campaign.
- Mobile-friendly canvass map and door visit form.
- Tenant Row Level Security (RLS) in Postgres.
- Draw territory polygons on the map, automatically attach the addresses inside them, and assign the territory to a canvasser.
- Canvasser accounts are scoped to their assigned doors; managers can see the broader campaign.
- Tables for territories, teams, assignments, visits and activity logs.

## Important data model choice

Civic address points indicate mapped addresses; they do not prove occupancy, voter eligibility, or who lives at a location. CanvassHQ stores operational canvass outcomes and optional notes; the starter does not create demographic profiles, persuasion scores, inferred political views, or automated targeting recommendations.

## 1. Create a Supabase project

Create a new Supabase project. In SQL Editor, run:

`supabase/migrations/001_initial.sql`

Then open **Project Settings -> API / Connect** and copy your project URL, publishable key and service-role key.

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or commit it to GitHub.

## 3. Configure Supabase Auth URLs

In Supabase Authentication URL configuration:

- Site URL for local development: `http://localhost:3000`
- Add redirect URL: `http://localhost:3000/auth/callback`
- After deploying, also add `https://YOUR_DOMAIN/auth/callback`

## 4. Install and run

Node.js 20.9+ is required by current Next.js 16 documentation.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 5. First owner flow

1. Create an account.
2. Sign in.
3. The app sends you to `/onboarding` if you do not belong to a workspace.
4. Create the organization and campaign. Your account is inserted as `owner`.
5. Open **Canvass map**.
6. Click **Sync official Surrey North addresses**.
7. Open **Team & access** to invite volunteers and staff.
8. Open **Territories** to draw an area and assign its addresses to a canvasser.

## 6. Deploy to Vercel

Push the folder to GitHub, import the repository into Vercel, and add the same environment variables in Vercel Project Settings. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS URL.

The address import route declares a 60-second maximum duration. For very large jurisdictions, move imports to a background job/queue rather than a single web request.

## GIS sources used

### Provincial riding boundary
DataBC ArcGIS layer 74:

`Provincial Electoral Districts - Electoral Boundaries Redistribution, 2023`

The source KML loader you supplied is retained in `data/WHSE_ADMIN_BOUNDARIES.EBC_ELECTORAL_DISTS_BS11_SVW_loader.kml` as a reference. The app queries the ArcGIS GeoJSON service directly because it is easier to use in the web application.

### Surrey addresses
City of Surrey Open Data, `Address Points` layer 138. It contains civic address point geometry and fields including house number, road name, status and address type.

## Selling the SaaS

The database is already tenant-aware. A future customer can create their own organization and become its owner. Their rows are separated by `organization_id`, and RLS prevents ordinary users in one organization from reading another organization's data.

For a commercial launch, the next platform-level features should be:

- Stripe subscriptions and plan limits.
- Platform Super Admin console.
- Workspace switcher for users who belong to multiple organizations.
- Team schedules and volunteer shifts.
- CSV exports and campaign reports.
- Audit/revocation UI.
- Production map tile provider instead of relying on the public OpenStreetMap tile server at scale.
- Background GIS import queue for large cities/districts.

## Security notes

- Service-role key is server-only.
- RLS is enabled on tenant data.
- Invitations are authorized by an Owner/Admin check.
- Address sync is authorized by an Owner/Admin check.
- Canvass records require a signed-in member with a field role.
- Use TLS/HTTPS in production.
- Minimize personal information and set a written retention policy appropriate to the laws and election rules that apply to each customer.

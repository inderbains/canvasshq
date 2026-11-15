# RealVolt Social Studio

## Update 3 — Working core CRM

### Install on your existing app
1. Upload this ZIP's EXTRACTED source files and folders to the root of your existing GitHub `crmsocial` repository. Replace same-name files, including package.json and package-lock.json. Include .github and tests.
2. In your EXISTING Supabase project's SQL Editor run `supabase/003_crm.sql`.
3. If you have NOT installed the workspace/property update yet, also run `supabase/002_workspace_properties.sql`. Do not rerun `schema.sql` when social_drafts and brand_kits already exist.
4. Keep Hostinger's current public Supabase environment variables and redeploy with output directory `out`.
5. Open My workspace > CRM. The CRM tile now opens the working application.

### CRM included
- Dashboard: contact counts, open pipeline, overdue tasks, closed contacts, upcoming follow-ups and recent contacts.
- Contacts: create/edit/delete; email/phone; buyer/seller/type; source; area; budget; tags; pipeline stage; assigned-agent label and marketing consent status.
- Search name/email/phone/tags/source/area/agent; filter by contact type and stage.
- Profiles: saved contact information, linked tasks and a chronological activity/notes history with manual Note/Call/Email/Meeting entries.
- Pipeline: stage columns with explicit Move to selectors, profile links and follow-up creation.
- Tasks: create/edit/delete, optional linked contact, due date, priority, complete/reopen, Open/Overdue/Today/Completed filters.
- CSV: downloadable format, validated preview before importing up to 500 contacts, skip duplicate emails, export currently filtered contacts. No existing records are overwritten by import.
- All CRM data persists in Supabase. RLS isolates users and enforces ownership when linking tasks/notes to contacts. Duplicate nonempty contact emails are prevented per user in the database.

### Explicit limits
- This is a working CORE CRM, not every possible CRM integration.
- Assigned agent is a text organisational label; it does not invite agents, transfer ownership or grant team access. Brokerage-wide CRM sharing/roles are not implemented.
- Email/phone links open your mail/calling app. Activity entries are manual. No inbox sync, tracked email sending, SMS or automated email sequences are included.
- Task due dates show in the CRM; no unattended email/push reminders run yet.
- No MLS/DDF lead ingestion, transactions, digital signatures, commission accounting or real social publishing is included.
- Consent is recorded as an account-entered status; no legal consent collection/audit workflow is claimed.
- Contacts without email can still duplicate. CSV field values must follow the provided template. Export neutralises formula-leading values for spreadsheet safety.
- Contact deletion also deletes that contact's notes and linked tasks, after a confirmation dialog.

### Validation
Production static build and TypeScript checks passed; six CSV tests cover quoted/multiline fields, malformed rows, duplicate skipping, validation, formula safety and round trips. Run `npm test` to repeat them.
Live Supabase migration, cross-account access tests and Hostinger browser tests require your project setup and have not been performed here.

### Check on your deployed app
Create a contact, reload, search/filter it, update stage from Pipeline, record a note, add a dated task, mark/reopen it, edit contact fields and export. Import the template with a new email; importing it again should skip the duplicate. Sign in with a second account and verify it cannot see or modify the first account's contacts/tasks/notes. Confirm a forged task/notes insert pointing to another account's contact is rejected by RLS. Existing Social Studio/property pages should still work.

---


## Update 2 — Workspace dashboard + property pages

For your EXISTING crmsocial project:
1. Upload this ZIP's source files to the ROOT of your existing GitHub repository, replacing files of the same name. Include new files and folders. Do not upload the ZIP itself, node_modules, out or .env.local.
2. In your EXISTING Supabase project run ONLY `supabase/002_workspace_properties.sql`. This is an additive migration; it does not delete existing users, drafts or brand settings. Do NOT rerun schema.sql if the original tables are already installed.
3. Keep your existing Hostinger environment variables. Rebuild/redeploy from GitHub with output directory `out`.
4. After signing in, the main workspace opens first. The My workspace button always returns here; Social Studio opens the existing social dashboard.
5. Workspace settings lets the workspace owner select Individual agent or Brokerage. Brokerage mode displays Back Office. This setting configures the module menu only; it is NOT a team role/permission system.
6. Open Property Pages in Social Studio. Create a page, upload photos, add details and public agent contacts. Save a private draft or select Publish when saving.
7. For a published page use Open or Copy link. Public URLs use `/property/?id=...`, compatible with static hosting. Unpublish to make the public link unavailable.

### What is ready and what is planned
- Ready in code: workspace hub/navigation, saved workspace name/type, property-page CRUD (create/read/update and unpublish), public property gallery/contact page and shareable links.
- Transactions, Sign Digi and Back Office have clearly marked planned-module screens. CRM now opens the working core application described above.
- Facebook/Instagram/LinkedIn OAuth and publishing are still pending.
- Property pages contain PUBLIC marketing data only. Published records can be read by anonymous visitors under RLS. Never put private seller/client notes in them. Drafts are restricted to their owner. Agent contact details become public when published.
- Public page content is loaded in the browser, so social-link preview images and per-property server-rendered SEO metadata are not implemented yet.
- Photos are compressed and stored in JSON for this starter. A private Storage-based media pipeline is a future scaling step.

### Acceptance checks on your deployed app
- My workspace opens the module dashboard; Social Studio reopens the social overview.
- Individual workspace has no Back Office tile. Select Brokerage and save: tile appears and remains after reload.
- Create/edit a property draft. Its public URL must be unavailable to a signed-out browser.
- Publish it, copy the link, open incognito, check gallery, details and contact buttons.
- Unpublish and reload the incognito URL: it must become unavailable.
- Account B cannot edit/read Account A's drafts or workspace settings; published property marketing pages are public.
- Existing social drafts and branding still load.

Production build and TypeScript checks are run locally. Live database migration, authentication, publication and two-account isolation checks need your deployed Supabase project and are not claimed as completed.

---


Next.js App Router + React + TypeScript + Supabase. Builds with Node.js into static HTML/CSS/JS for regular Hostinger shared hosting.

## Included
- Responsive social dashboard, eight curated templates, reusable canvas previews and matching PNG exports.
- Headline, caption, photo and channel editor; user-owned cloud drafts; content planning calendar.
- Brand kit with name, website and colour.
- Email/password signup, sign-in, confirmation redirect, reset-password flow and sign-out.
- Supabase SQL with Row Level Security for account separation.
- Facebook/Instagram/LinkedIn connection setup screens. Actual provider OAuth and publishing are NOT implemented.
- Core CRM is included; transactions are a future module.

## First: Supabase
1. Create a new Supabase project. In SQL Editor run `supabase/schema.sql` once.
2. If you already ran the SAME schema from the previous HTML starter in this project, skip this step: both versions use the same tables. Do not rerun the create-table script over an existing database.
3. Enable Email authentication. Keep confirmation enabled and configure SMTP for real users.
4. In Auth URL Configuration set Site URL to your final HTTPS Hostinger app URL and allow the exact URL as an additional redirect (including trailing slash/subfolder).
5. Copy your project URL and PUBLIC publishable key. Never expose a secret/service_role key.

## Local development
Use Node.js 22 or newer.
```bash
npm ci
cp .env.example .env.local
# Edit .env.local with your Supabase URL and public publishable key.
npm run dev
```
Open http://localhost:3000. Add this local URL to Supabase's redirect allowlist if testing confirmation/recovery locally.

## Create your GitHub project
Create an empty private repository named `realvolt-social`. Extract this ZIP and upload ALL source files to the repository root, including `.github/workflows/build.yml`, `.gitignore` and `.env.example`. Do not upload node_modules, .env.local, .next or out.

Alternatively, from this extracted directory:
```bash
git init
git add .
git commit -m "Start RealVolt social workspace"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/realvolt-social.git
git push -u origin main
```
Replace the example remote with your actual new repository URL. No repository has been created or pushed on your behalf.

## Build on GitHub
Under repository Settings > Secrets and variables > Actions > Variables, create:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_BASE_PATH (optional; empty for a domain/subdomain root, `/social` for a subfolder)

These values are intentionally public browser configuration. Database policies protect records. Do NOT use the Supabase secret key.

Push to main or run Actions > Build Hostinger website > Run workflow. Download the `hostinger-website` artifact from the successful run. It contains the exported website: index.html, _next and other generated assets.

IMPORTANT: changing variables requires a NEW build. The public configuration is embedded at build time.

## Deploy to your connected Hostinger account
Regular shared hosting serves the exported files; it does NOT run `next start` or build this source repository automatically.

Recommended first deployment:
1. Use a separate domain/subdomain directory. Back up any existing website first.
2. Build via GitHub Actions as above.
3. Extract the CONTENTS of the downloaded artifact into the target Hostinger public_html directory. The index.html and _next folder must be directly inside that web root.
4. Use HTTPS and test the final URL. Set the same final URL in Supabase Auth settings.

A GitHub-to-Hostinger connection that only pulls the SOURCE will not deploy this Next.js app correctly. It must receive the BUILD OUTPUT. This package includes build-artifact generation, not automatic remote upload. If your Hostinger connection requires a deployment branch or a specific folder, use that mechanism to deploy the contents of out/ only. Do not point the live web root at source files or publish .env.local.

Local build alternative:
```bash
npm run typecheck
npm run build
```
Upload everything INSIDE out/ to the web root. There is no persistent Node process on shared hosting. No PHP/MySQL is needed.

## How to verify your installation
- Create Account A, confirm email, sign in. Save a draft, upload photo, save brand, choose planned date, export PNG.
- Reload and check saved records.
- Sign out and sign in as Account B; A's drafts/brand must not appear.
- Confirm signed-out database reads are denied. Test isolation through authenticated requests as well as UI.
- Test confirmation and password recovery on the FINAL domain.
- Test mobile layout, calendar navigation, image uploads and PNG downloads.

## Boundaries and next steps
- Dates are local planning strings, not scheduled publishing jobs.
- Photos are resized and stored in JSON for this small starter. Migrate to private Supabase Storage with user-scoped policies and signed URLs before scaling.
- Sample photos load from Unsplash and fonts from Google Fonts. Use licensed listing photos for real marketing.
- Next phase: Supabase Edge Functions for Meta/LinkedIn OAuth callbacks, encrypted server-side token handling, permissions review and scheduled publishing. Never store provider tokens in browser code or public user-readable tables.
- This is an initial source project, not a completed brokerage SaaS. No team roles, MLS/DDF ingestion, analytics, real ad buying or transaction processing yet.
- Live Supabase Auth, SQL execution, account-isolation and real hosting checks require your project configuration and were not performed in this environment.

## Reference
https://nextjs.org/docs/app/guides/static-exports
https://supabase.com/docs/guides/getting-started/api-keys
https://supabase.com/docs/reference/javascript/auth-signinwithpassword

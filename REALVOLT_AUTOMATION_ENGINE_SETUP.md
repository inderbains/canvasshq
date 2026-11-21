# RealVolt CRM Automation Engine — Phase 1

**Scope:** Add-on to the EXISTING RealVolt Next.js 16 + Supabase project. This is **not** a new SaaS installation. Designed for the `crm_contacts`, `crm_notes` and `crm_tasks` tables from `supabase/003_crm.sql`.

## Before installing

1. Back up the production GitHub branch and Supabase database. Use a staging environment first.
2. Copy the folders from `RealVolt_Automation_Engine_Phase1_Patch.zip` **into the matching paths** in your GitHub checkout. Do not upload the ZIP as a file, and do not put `page.tsx`, `.tsx`, or `.css` files at the repository root.
3. Check the merge diff for the two modified existing files, `app/realvolt-workspace.tsx` and `app/real-estate-crm/real-estate-crm.tsx`; preserve any newer changes you've made since your uploaded project ZIP.
4. Run `supabase/023_crm_automation_engine.sql` **once** in Supabase SQL Editor, on staging first. This is additive; it does not drop CRM or trust data. It creates automation tables, trigger, policies, and worker RPCs.
5. Configure these **server-only** Hostinger environment values (never prefix these with `NEXT_PUBLIC_`, never paste them into GitHub or chat):
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role secret, for the server worker only.
   - `REALVOLT_AUTOMATION_CRON_SECRET` — long random secret, minimum 24 characters, for your private cron invocation.
   - Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remain unchanged.
6. Set a Hostinger cron task to call the private worker **every 1–5 minutes** with HTTP POST and an Authorization bearer header. An example shell command (replace hostname and use the secret from a protected server environment variable) is:

```bash
curl --fail --silent --show-error --max-time 30 \
  -X POST -H "Authorization: Bearer $REALVOLT_AUTOMATION_CRON_SECRET" \
  "https://YOUR-REALVOLT-DOMAIN/api/rv-automation/run"
```

**Do not run this endpoint publicly or add your secret to JavaScript, browser code, or URL parameters.** It works only when the two server secrets have been configured and the migration has been installed. For Hostinger cron, confirm the secret is actually available to the cron shell; otherwise use a secured server configuration. Do not configure any external scheduler without protecting the secret.

## Where to open

- RealVolt workspace → **CRM → Automations**
- The global Social Studio **Automations** page keeps its EXISTING listing rules; for CRM workflows use CRM → **Automations** or `/crm-automations`
- The standalone Real Estate CRM sidebar → **Automation Studio**, or direct route `/crm-automations`
- Existing **Listing rules** remain available as a tab in Automations.

## How to test the complete workflow

1. Create a workflow using **New buyer inquiry**; save it (it starts disabled).
2. Preview the steps and **Enable** the workflow.
3. In the existing CRM, create a **brand-new test Buyer contact**. Existing contacts are not automatically enrolled merely because you enabled a workflow.
4. Open **Automation Studio → Activity log**. The new contact should create a run and a `pending` job without calling the worker.
5. Call the secured worker (cron invocation above) once. It should process the immediate step.
6. Open **Email drafts**. Review the draft. **Nothing has been sent**.
7. The delayed follow-up task is queued for the next scheduled time. After that time passes, run cron again; confirm a CRM task appears for the same contact. Delayed steps are not processed before their due time.
8. Test the **Qualified** stage workflow by changing a test contact's stage. Test opt-out: no draft should be created for a contact marked **Opted out**. Test pause: new contacts should no longer enroll while disabled.
9. Test with two distinct agent accounts to confirm one agent cannot read another agent's workflows or email drafts.
10. Run `npm run typecheck`, `npm test`, `npm run build` and rebuild on Hostinger after merging.

## Implemented and deliberately not implemented

**Implemented:** CRM `contact_created` and `stage_changed` database triggers; optional contact-type/stage filters; sequence of actions and delays; template-based CRM task, note and plain-text email draft actions; agent-owned RLS; run/job history; private lease-based worker; duplicate protection on generated tasks/notes/drafts; 5-attempt retry with increasing delay; pause control; sample preview.

**Not yet implemented:** Gmail/Outlook OAuth and two-way inbox; automated email or SMS sending; AI-generated messaging for workflows (manual AI drafting remains in Real Estate CRM); real-time reply detection or cancellation; brokerage-wide workflow sharing; visual branch/condition builder; Facebook/Instagram inbound webhooks; automatic social posting or trust/commission changes.

**Critical:** The email templates are drafts, not messages. Do not represent a completed job as a delivered email. The worker uses a Supabase service-role key, so protecting the cron endpoint is essential. Never put this key in client code. All marketing delivery added later must enforce consent/unsubscribe suppression, sender verification, and limits. Any AI or email provider may incur additional usage costs.

## Backout plan

Pause all workflows; disable the Hostinger cron entry to stop execution; revert the source-code commit if necessary. Leave automation tables in place initially to preserve history. Do not drop tables/triggers on production without a reviewed data migration and rollback plan.

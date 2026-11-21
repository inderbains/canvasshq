# RealVolt — Existing Funnel Automation Upgrade

**Purpose:** Enhance your EXISTING RealVolt CRM funnel. No replacement CRM, duplicate funnel, or new website builder. Preserves your current light/green interface and existing Marketing → Listing rules.

## Files and installation

This patch contains the existing Phase 1 automation engine plus the new confirmed-event Stage automation upgrade. The baseline for the two edited TSX files is your saved `RealVolt_Full_Project_Corrected.zip` project, not a live GitHub checkout. **Review the diff against your current main branch before applying.** Do not replace newer files without merging their changes.

1. Back up your existing GitHub main branch and Supabase database. Use **staging first**.
2. Unzip this package locally. Copy **the nested folders' contents** into the corresponding paths in your repository (never place root `page.tsx` or random ZIP files inside GitHub).
3. Review changes in `app/realvolt-workspace.tsx` and `app/real-estate-crm/real-estate-crm.tsx`. These preserve Marketing → Listing rules and add CRM → Automations. The Real Estate CRM activity log now offers Note / Call / Email / Meeting.
4. In your Supabase SQL Editor, after backing up the database, run `supabase/023_crm_automation_engine.sql` *once* **if not already installed**, then `supabase/030_crm_funnel_auto_stages.sql`. Both require your previously installed CRM/showings schema; the second is additive and can be re-run. Do not rerun Phase 1's SQL blindly because it has CREATE POLICY statements.
5. Add server-only Hostinger environment variables `SUPABASE_SERVICE_ROLE_KEY` and `REALVOLT_AUTOMATION_CRON_SECRET` (at least 24 random characters). **Do not** set `NEXT_PUBLIC_` prefixes, put secrets into GitHub, or send the actual values in chat.
6. Schedule a secure server cron POST to `https://YOUR_DOMAIN/api/rv-automation/run` every 1–5 minutes using `Authorization: Bearer <PRIVATE_CRON_SECRET>`, as described in `REALVOLT_AUTOMATION_ENGINE_SETUP.md`. The Postgres funnel stage updates themselves happen immediately on events, **without** cron. Workflow tasks and drafts due later require cron.
7. Run `npm install`, `npm run typecheck`, `npm test`, `npm run build` in your checkout. Check staging before production.

## What is actually automatic

| Real evidence | Action |
| --- | --- |
| New or repeat agent website inquiry (`Agent Website`) | Existing website RPC creates/links CRM contact and deduplicated note; each successfully recorded inquiry automatically gets a follow-up task, even for an existing contact |
| New Open House QR visitor | Existing registration RPC creates/links CRM contact and follow-up; new contacts can enroll in enabled automation workflows |
| Manually imported Meta lead CSV | New contact enters the existing funnel at `New`, gets an agent follow-up task |
| Create a CRM contact | When an agent enables a `contact_created` workflow, the engine schedules tasks/notes/email **drafts** |
| Log a Call, Email, or Meeting | CRM contact automatically advances from `New` to `Contacted`; ordinary notes do not advance leads |
| Confirm/complete a showing | Linked contact advances from `New`, `Contacted` or `Qualified` to `Active`; pending/rescheduled/declined showings do nothing |
| Change a CRM stage (automatically or manually) | An enabled `stage_changed` workflow is enrolled |
| Stage `Under contract`, `Closed`, or `Lost` | Preserved; **not** automatically modified based on ambiguous back-office review status. Move these on verified transaction milestones |

## Safety, privacy and limitations

- Agent records are private under existing CRM RLS. Automatic stage audit is in `rv_funnel_auto_events` with owner-only SELECT policies.
- Only actual CRM activity or confirmed showings advance stages. No spurious `Closed` moves, no regressions, no overriding declined/lost clients.
- Automation email actions are **draft-only**. Nothing is emailed or texted automatically; marketing consent must be respected before any future delivery integration.
- **Meta live webhook is not implemented**; only existing manual CSV imports are captured. Gmail/Microsoft 365 two-way connections and AI reply detection are not included.
- Website inquiries for an **existing** contact keep their current stage and produce a note, not a duplicate person or new-contact workflow.
- The Phase 1 automation engine must be installed/enabled and the cron scheduled before delayed steps run. Stage updates and new-contact tasks from `030` work without cron.
- This ZIP is a **ready-to-merge code patch**, not a deployed change. No access to your live GitHub, hosting, or Supabase was used.

## Staging test checklist

1. Create a new test agent-site inquiry: confirm one CRM contact with source `Agent Website` + one high-priority task. Repeat the same request ID: no duplicate. Submit a **new** request ID for the same email: the existing CRM contact gets a new inquiry note and follow-up task.
2. Use an Open House QR test registration: confirm CRM contact and existing follow-up, but no redundant website/Meta task.
3. Import one test Meta CSV row: confirm CRM contact and high-priority task. No live Meta webhook claims.
4. Log a `Call` for a test `New` lead: stage advances to `Contacted`, audit records `Logged activity`. Log an ordinary `Note`: no stage move.
5. Submit a property showing, mark it `Confirmed`: linked contact advances to `Active`. Mark a different showing `Declined`: stage unchanged. Mark a `Closed` contact's showing `Completed`: remains `Closed`.
6. Enable a workflow in CRM → Automations; create a test lead, invoke secured worker, confirm tasks and email drafts generated. Disable the workflow and verify no new runs. Test an opted-out lead: no marketing draft.
7. Use two separate agents and confirm each only sees their own contacts, tasks, workflows, and automatic stage events.
8. Confirm Marketing → Listing rules still opens. Inspect the UI in desktop/mobile without any new clutter on the dashboard.

# RealVolt CRM and Transactions update

Replace the application source with this version, retaining your existing Hostinger environment variables. Build command: npm run build. Node: 22.

1. In your existing Supabase project's SQL Editor, run supabase/004_transactions.sql once, after schema.sql, 002_workspace_properties.sql and 003_crm.sql have been installed. This creates transaction tables, access policies and a private attachment bucket. Do not rerun 004 after successful installation.
2. Create/sign in to a separate back-office admin account. Find agent and admin UUIDs in Supabase Authentication > Users.
3. As project owner, assign the reviewer using the INSERT example at the bottom of 004_transactions.sql. Assignment is controlled through SQL, not by agent workspace settings. Each agent has one reviewer; reviewers can review multiple agents.
4. Test using two accounts: agent adds listing, attaches files, converts to sale, saves and submits. Admin opens Back Office and approves or requests changes. Requested changes unlock the agent file for editing and resubmission. Submitted and approved files stay locked.

Files up to 20 MB each: PDF, JPG, PNG, Word, Excel and text. Files stay private; download links expire after two minutes. Failed metadata writes may leave an inaccessible uploaded object for project-owner cleanup. There are no automatic email notifications.

CRM sidebar contains Overview, All Contacts, Buyers, Sellers, Investors, Meta Leads, Pipeline and Follow-ups. Investors uses the contact's Investor tag/text; Meta Leads uses Meta in its source/text. Meta lead ingestion is not enabled by this update.

Transactions sidebar contains All transactions, Listings, Sales and Submitted. Back Office contains Review queue, Changes requested and Approved. My workspace shows application navigation rather than the Social Studio menu.

Validation: run npm run typecheck, npm test and npm run build. Live database permissions and uploads must be verified against your configured Supabase project; this package does not contain credentials or run your migration.

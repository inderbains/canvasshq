# RealVolt — Automatic CMA: authorized sold-data lookup

**A merge patch for the EXISTING RealVolt Next.js + Supabase application.** This is **not a standalone website**, a new CRM, or a new Supabase project. The existing clean forest-green and white Agentic AI screen is retained.

## What is actually included

1. Agent enters **full address including city**, bedrooms, and bathrooms. Finished square footage is optional at search time; if exact MLS listing history supplies it, RealVolt can prefill it **for the agent to verify**.
2. Agent clicks **Find nearby sold comparables**. RealVolt looks for an **exact address match** in a Repliers-authorized MLS feed, obtains the subject listing's coordinates and property type, and requests nearby unavailable/sold listings (`status=U`, `lastStatus=Sld`).
3. The code filters out unrelated property types, expired/conditional/unsold results, self-comparisons, missing prices or square footage, unrealistic sizes, and duplicate addresses. It ranks eligible sales by location, recency, and similarity. This is a starting point—not a substitute for adjustments and professional judgment.
4. Agent **selects 3–12** sold comparables. RealVolt **re-fetches/re-verifies** the selections server-side before generating a CMA, so a client cannot invent sale prices and label them licensed MLS records.
5. The existing CMA calculator still uses **median sold price per finished square foot × subject area**, with an **illustrative ±8% range** and clear limitations. PDF export includes comparable addresses, MLS numbers and provider-reported sale dates.
6. The **manual comparable-entry** method remains available, along with all other Agentic AI tools.

## Crucial licensing and data details

- **You must obtain a Repliers API key and explicit sold-data usage permission for the relevant MLS/board and CMA use.** Repliers documents that sold listings require proper MLS authorization. A CREA REALTOR.ca **DDF feed is not a general sold-data feed** and cannot be substituted.
- `soldDate` is **the provider-reported MLS sold/status date**, not necessarily the legal completion date. The current PDF labels it accordingly. Do not publish or share sold-data details unless your provider and board permit that specific use.
- Automatic lookup depends on the **subject property having exact MLS address history with coordinates**, and at least three sufficiently comparable sales in the authorized feed. If not, it shows a clear limitation and retains manual entry; **it does not scrape real estate portals or invent results**.
- Repliers field formats and board coverage vary. Verify against a real authorized Surrey/BC sandbox/feed before using for clients. Only this provider is wired in this patch; adapters for other licensed feeds can be added later.
- To avoid transmitting licensed sold records to an external AI service without permission, automatic CMAs use **deterministic local text** by default. An AI-written CMA narrative using the licensed comps is enabled only when the separate `REALVOLT_CMA_AI_DATA_PROCESSING_APPROVED=true` flag is set after checking the applicable data-processing restrictions. Manual CMA narrative generation works as before.

## Install procedure

1. **Back up** your GitHub `main` branch and Supabase database. Use a **staging environment** first.
2. This patch is based on the previously supplied `RealVolt_Steps_3_4_5_Upgrade.zip` snapshot, **not a verified checkout of your current live GitHub main**. Examine diffs first. Merge these **existing files** with any newer edits instead of blindly overwriting:
   - `app/realvolt-ai-studio.tsx` — new automatic lookup/selection UI and manual fallback
   - `app/realvolt-enhancements.module.css` — minimal matching styles
   - `app/api/realvolt-ai/generate/route.ts` — verified autosales mode, provenance and third-party AI data sharing control
3. Add the **new files** at these exact paths:
   - `app/api/realvolt-ai/comparables/route.ts` — authenticated sold-property lookup endpoint
   - `lib/rv-cma-provider.ts` — server-only Repliers client, validation and ranking
   - `tests/rv-auto-cma-provider.test.mjs` — provider/mock tests
4. No additional database schema migration is required. The patch reuses your existing installed **SQL 032 `rv_ai_generations`** ledger. A successful lookup consumes one CMA usage entry, and generating a report consumes another. The current best-effort limit is 15 successful operations per hour (not an atomic production-grade limiter). Strengthen limits and add billing controls before onboarding many users.
5. **Only after written sold-data authorization**, set these **server-only** environment variables in Hostinger's Next.js environment (do **not** add them to GitHub or use `NEXT_PUBLIC_`):

```env
REPLIERS_API_KEY=<private key supplied by provider>
REALVOLT_CMA_SOLD_DATA_APPROVED=true
REALVOLT_CMA_ALLOWED_USER_IDS=<comma-separated Supabase auth.users UUIDs approved for licensed data>
REALVOLT_CMA_AI_DATA_PROCESSING_APPROVED=false
```

   Keep `OPENAI_API_KEY` as previously configured for the other AI tools. `REALVOLT_CMA_AI_DATA_PROCESSING_APPROVED` must remain `false` unless your sold-data agreement permits sending MLS records to your AI processing provider. A flag is **not permission** by itself.
6. Determine allowed users' UUIDs from **Supabase → Authentication → Users**. Initially grant access only to your own test user. The allowlist is a short-term entitlement gate; before serving other brokerages, add per-brokerage licensing and audit controls tied to each data agreement.
7. Redeploy the code; then in RealVolt open **CRM → Agentic AI → CMA report**. Enter `5928 140A St, Surrey, BC` or another legitimate subject address, beds/baths, and click **Find nearby sold comparables**. Inspect returned results and confirm size/property type. Choose 3–12. Click **Calculate & prepare CMA**, then download the PDF.
8. Test the **manual method** and other Agentic AI modes to ensure they are unchanged.

## Staging acceptance checklist

- [ ] With **no Repliers key/approval**, automatic lookup returns an informative access message. The manual CMA still generates.
- [ ] An **authenticated allowlisted user** can search via the browser, while an unauthenticated or unapproved user cannot.
- [ ] An MLS sold result includes a real MLS identifier, real provider-reported sale price/date, and nonzero confirmed square footage. Invalid, future, 365+ day-old and duplicate records are excluded.
- [ ] Missing exact subject listing, missing coordinates, or fewer than three sold comparables shows a clear limitation; the system never fabricates prices.
- [ ] An agent can deselect unsuitable comps and select 3–12 records. A tampered MLS id/price is rejected or re-verified; client-submitted sold price is ignored in automatic mode.
- [ ] Completed CMA has the same selected MLS prices as the live provider records at generation time, and includes provenance in the report and PDF.
- [ ] `REALVOLT_CMA_AI_DATA_PROCESSING_APPROVED=false` never forwards MLS sold comparable details to the external AI narrative API.
- [ ] Manual CMA, listing description, marketing draft, lead next steps, PDF download, drag-and-drop pipeline, and Automation Studio continue working.
- [ ] Run `npm install`, `npm run typecheck`, `npm test`, and `npm run build` on a complete checkout; deploy only after successful staging build.

## Local validation performed while packaging

- TypeScript/TSX syntax transpilation checks pass for new and changed files.
- Five mocked-provider unit tests pass for civic address parsing, permission gating, exact subject match, filtering, re-verification, and no-history behavior.
- **Not yet tested:** Real Repliers API credentials, BC board availability, a full Next.js production build, a live Supabase session, Hostinger deployment, client browser interactions, or data-provider license rights. These need staged confirmation. No live GitHub or Supabase changes are made by this ZIP.

## Documentation used

- Repliers CMA guide: https://help.repliers.com/en/article/building-cmas-with-the-repliers-api-complete-implementation-guide-dlv0ez/
- Repliers sold-data access: https://help.repliers.com/en/article/a-guide-to-accessing-sold-leased-listings-19alfew/
- Repliers response fields: https://help.repliers.com/en/article/understanding-the-data-in-a-listings-response-v0gh0d/
- CREA DDF documentation: https://ddfapi-docs.realtor.ca/

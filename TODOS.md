# TODOS

## P? — Leads page: surface latest client interactions

**What:** The /leads page should reflect the latest state of the relationship with each client, drawing on (a) the client context doc and (b) email correspondence — not just the booking-time data plus sales call doc.

**Why:** Today the row shows fit/booking data + the sales call summary, but doesn't reflect post-call activity (proposals sent, replies, follow-ups, ghosting). Vaiga has to context-switch into Gmail to know where each conversation actually stands.

**Status:** Captured pending elaboration. Vaiga to clarify which signals matter most (latest email date, last reply direction, awaiting-action flag, change in ask, etc.) and how it should render in the row vs the drawer.

**Where to start (when ready):** Likely a Gmail search per engagement email, plus parsing the client context doc for last-update markers; surface a "last interaction" cell + an updated drawer block alongside the call summary.

## P2 — Meta API cron (replace Make.com)

**What:** Build `/api/cron/meta-pull` + `lib/meta.ts` to pull Meta Marketing API ad performance data daily via Vercel cron.

**Why:** Make.com is partially working and is an external paid dependency. Direct Meta API integration gives full control over data freshness, fields, and scheduling — and eliminates the Make.com cost and reliability dependency.

**Pros:** Independent data pipeline, fresh Dashboard data, no Make.com coupling.

**Cons:** Meta access token management (long-lived tokens, refresh logic), pagination complexity, Meta API version deprecations.

**Context:** The Dashboard (`/`) currently reads from Google Sheets which is populated by Make.com. Make.com webhooks are configured but only partially functional. The plan deferred this as Phase 2 because Views 2 & 3 (Leads, Engagements) don't depend on it and Make.com is "good enough for now."

**Effort:** L (human: ~3 days / CC: ~2 hours)

**Depends on:** Vercel deployment (Phase 3) complete — cron jobs require a deployed Vercel project with `vercel.json` configured.

**Where to start:** `lib/meta.ts` — implement `fetchAdInsights(adAccountId, accessToken)` using Meta Graph API v19+. `app/api/cron/meta-pull/route.ts` — protected by `Authorization: Bearer <CRON_SECRET>`. `vercel.json` — add cron entry.

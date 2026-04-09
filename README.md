# VR Ads Platform

Internal tool for Valuation Realized to manage Meta ad performance, generate new ads, and maintain a living creative rulebook — powered by Claude AI and Google Sheets.

## Setup

### 1. Install dependencies

```bash
cd vr-ads-platform
bun install
```

### 2. Configure environment variables

Copy `.env.local` and fill in each value:

```bash
ANTHROPIC_API_KEY=          # From console.anthropic.com
GOOGLE_SHEETS_ID=           # The long ID from your Sheet URL
GOOGLE_SERVICE_ACCOUNT_EMAIL=  # e.g. vr-ads@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=  # Paste the full private key (with -----BEGIN...)
MAKE_REFRESH_WEBHOOK_URL=   # From Make Scenario 1
MAKE_ANALYSIS_WEBHOOK_URL=  # From Make Scenario 2
MAKE_SKILL_UPDATE_WEBHOOK_URL=  # From Make Scenario 6
```

### 3. Google Service Account setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Google Sheets API** under APIs & Services → Library
4. Go to APIs & Services → Credentials → Create Credentials → Service Account
5. Name it (e.g. `vr-ads`), click Create
6. Skip optional steps, click Done
7. Click on the service account → Keys tab → Add Key → JSON
8. Download the JSON file
9. Copy `client_email` into `GOOGLE_SERVICE_ACCOUNT_EMAIL`
10. Copy `private_key` into `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the full key including `-----BEGIN/END-----` and `\n` characters)
11. **Share your Google Sheet** with the service account email (give it Viewer access)

### 4. Google Sheets structure

Your sheet needs these tabs with these exact column orders:

**Summary** tab:
`ad_id | ad_name | campaign_name | adset_name | total_spend | total_leads | avg_cpl | avg_ctr | total_bookings | booking_rate | frequency | recommendation | recommendation_reasoning | alert | alert_reason | status`

**Rules** tab:
`rule_id | week | creative_type | hook_angle | geo | cpl | ctr | booking_rate | signal | rule_extracted`

**Production_Skill** tab:
`rule_id | category | instruction | status | added_date | modified_date | source | evidence`

**Bookings** tab:
`timestamp | name | email | utm_source | utm_campaign | utm_content | utm_medium`

Row 1 is always the header row (skipped by the app).

### 5. Run locally

```bash
bun run dev
```

App runs at [http://localhost:3000](http://localhost:3000)

### 6. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

When prompted, add all environment variables from `.env.local` in the Vercel dashboard:
- Settings → Environment Variables → add each key

For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: paste the full key value. Vercel handles newlines correctly.

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Live ad performance grid from Meta via Google Sheets |
| New Ads | `/ads` | Generate new ad variants with Claude |
| Upload Queue | `/upload` | Approved ads ready to copy into Meta Ads Manager |
| Skills | `/skills` | Production_Skill rulebook — Claude reads this before every generation |

## Architecture

- **Next.js 15** (App Router) — server components for Sheets reads, client components for interactivity
- **Google Sheets** — sole data layer. All writes go via Make webhooks.
- **Anthropic Claude** (claude-sonnet-4-6) — ad copy generation + SVG visual generation
- **Tailwind CSS** — VR brand colors: dark green `#12301E`, gold `#BC8F4D`, off-white `#F7F5F1`
- **localStorage** — upload queue persisted client-side between sessions

## Make webhook payloads

**Skill update** (`MAKE_SKILL_UPDATE_WEBHOOK_URL`):
```json
{
  "action": "NEW" | "AMEND" | "DELETE",
  "rule_id": "R001",
  "category": "Copy",
  "instruction": "Always open with a stat...",
  "evidence": "3 approved ads used this pattern"
}
```

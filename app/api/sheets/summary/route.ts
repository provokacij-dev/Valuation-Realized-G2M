import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import type { AdSummary } from "@/types";

// Normalise a header string for matching: lowercase, collapse non-alphanumeric to space
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Build a map of normalised header → column index from a header row
function buildColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h) map[norm(h)] = i;
  });
  return map;
}

// Get a string value from a row, trying multiple possible header keys
function col(row: string[], map: Record<string, number>, ...keys: string[]): string {
  for (const key of keys) {
    const idx = map[norm(key)];
    if (idx !== undefined && row[idx] !== undefined) return row[idx] || "";
  }
  return "";
}

// Get a numeric value
function num(row: string[], map: Record<string, number>, ...keys: string[]): number {
  return parseFloat(col(row, map, ...keys)) || 0;
}

// Detect which row in rows[] is the column-name header (not the section header)
// by looking for a row that contains at least two of our expected column keywords.
const COLUMN_KEYWORDS = ["impressions", "spend", "ctr", "clicks", "emails", "revenue", "deals"];

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const normalised = rows[i].map(norm).join(" ");
    const matches = COLUMN_KEYWORDS.filter((kw) => normalised.includes(kw));
    if (matches.length >= 2) return i;
  }
  return 0; // fallback: first row
}

export async function GET() {
  try {
    const rows = await getSheetData("Summary");
    if (rows.length < 2) return NextResponse.json([]);

    // Find header row (handles 1-row or 2-row header blocks from merged cells)
    const headerIdx = findHeaderRowIndex(rows);
    const colMap = buildColMap(rows[headerIdx]);
    const dataRows = rows.slice(headerIdx + 1);

    const ads: AdSummary[] = dataRows
      .filter((row) => row.length > 0 && row.some((c) => c.trim()))
      .map((row) => {
        // Identity — try common name variants
        const ad_id         = col(row, colMap, "ad id", "ad_id", "id");
        const ad_name       = col(row, colMap, "ad name", "ad_name", "name", "ad");
        const campaign_name = col(row, colMap, "campaign name", "campaign_name", "campaign");
        const adset_name    = col(row, colMap, "adset name", "adset_name", "ad set name", "ad set", "adset");
        const period        = col(row, colMap, "date", "period", "week", "month");
        const status        = (col(row, colMap, "status") || "active") as AdSummary["status"];

        // AD PERFORMANCE
        const total_spend   = num(row, colMap, "ad spend", "spend", "total spend");
        const impressions   = num(row, colMap, "impressions");
        const clicks        = num(row, colMap, "clicks");
        const avg_ctr       = num(row, colMap, "ctr", "ctr %");
        const avg_cpc       = num(row, colMap, "cpc", "cpc €");
        const avg_cpm       = num(row, colMap, "cpm", "cpm €");
        const frequency     = num(row, colMap, "frequency");

        // FUNNEL
        const cta_video_clicks = num(row, colMap, "cta or video clicks", "cta video clicks", "cta clicks", "video clicks");
        const emails_captured  = num(row, colMap, "emails captured", "email captures", "emails", "leads");
        const click_email_rate = num(row, colMap, "click email rate", "click email rate %", "click to email rate");
        const cost_per_lead    = num(row, colMap, "cost per lead", "cpl");

        // CALLS
        const book_call_clicked    = num(row, colMap, "book call clicked", "book call");
        const calls_booked         = num(row, colMap, "calls booked", "booked calls", "bookings");
        const no_shows             = num(row, colMap, "no shows", "no-shows");
        const show_ups             = num(row, colMap, "show ups", "show-ups", "showups");
        const show_up_rate         = num(row, colMap, "show up rate", "show-up rate", "show up rate %");
        const email_call_rate      = num(row, colMap, "email call rate", "email to call rate", "email call rate %");
        const cost_per_booked_call = num(row, colMap, "cost per booked call");
        const cost_per_actual_call = num(row, colMap, "cost per actual call");

        // REVENUE
        const proposals_sent      = num(row, colMap, "proposals sent", "proposals");
        const deals_closed        = num(row, colMap, "deals closed", "deals", "closed deals");
        const revenue             = num(row, colMap, "revenue", "revenue €");
        const cost_per_closed_deal = num(row, colMap, "cost per closed deal", "cost per deal");

        // Analysis
        const recommendation = (col(row, colMap, "recommendation") || "MAINTAIN") as AdSummary["recommendation"];
        const recommendation_reasoning = col(row, colMap, "reasoning", "recommendation reasoning", "reason");
        const alert       = col(row, colMap, "alert") || undefined;
        const alert_reason = col(row, colMap, "alert reason") || undefined;

        return {
          // Identity
          ad_id: ad_id || ad_name,
          ad_name,
          campaign_name,
          adset_name,
          period,
          status,

          // AD PERFORMANCE
          total_spend, impressions, clicks, avg_ctr, avg_cpc, avg_cpm, frequency,

          // FUNNEL
          cta_video_clicks, emails_captured, click_email_rate, cost_per_lead,

          // CALLS
          book_call_clicked, calls_booked, no_shows, show_ups,
          show_up_rate, email_call_rate, cost_per_booked_call, cost_per_actual_call,

          // REVENUE
          proposals_sent, deals_closed, revenue, cost_per_closed_deal,

          // Analysis
          recommendation, recommendation_reasoning, alert, alert_reason,

          // Legacy aliases
          total_leads: emails_captured,
          avg_cpl: cost_per_lead,
          total_bookings: calls_booked,
          booking_rate: show_up_rate,
        } satisfies AdSummary;
      });

    return NextResponse.json(ads);
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Couldn't connect to Sheets — check your API credentials" },
      { status: 500 }
    );
  }
}

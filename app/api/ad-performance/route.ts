import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { AdSummary } from "@/types";

// ── GET: dashboard reads ad performance from Supabase ─────────────────────────
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("ad_performance")
      .select("*")
      .order("total_spend", { ascending: false });

    if (error) throw error;

    const ads: AdSummary[] = (data ?? []).map((row) => ({
      ad_id: row.ad_id,
      ad_name: row.ad_name || row.ad_id,
      campaign_name: row.campaign_name || "",
      adset_name: row.adset_name || "",
      period: row.period_start
        ? `${row.period_start}${row.period_end ? " – " + row.period_end : ""}`
        : "",
      status: (row.status || "active") as AdSummary["status"],

      // AD PERFORMANCE
      total_spend: row.total_spend ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      avg_ctr: row.avg_ctr ?? 0,
      avg_cpc: row.avg_cpc ?? 0,
      avg_cpm: row.avg_cpm ?? 0,
      frequency: row.frequency ?? 0,

      // FUNNEL
      cta_video_clicks: row.cta_video_clicks ?? 0,
      emails_captured: row.emails_captured ?? 0,
      click_email_rate: row.click_email_rate ?? 0,
      cost_per_lead: row.cost_per_lead ?? 0,

      // CALLS
      book_call_clicked: row.book_call_clicked ?? 0,
      calls_booked: row.calls_booked ?? 0,
      no_shows: row.no_shows ?? 0,
      show_ups: row.show_ups ?? 0,
      show_up_rate: row.show_up_rate ?? 0,
      email_call_rate: row.email_call_rate ?? 0,
      cost_per_booked_call: row.cost_per_booked_call ?? 0,
      cost_per_actual_call: row.cost_per_actual_call ?? 0,

      // REVENUE
      proposals_sent: row.proposals_sent ?? 0,
      deals_closed: row.deals_closed ?? 0,
      revenue: row.revenue ?? 0,
      cost_per_closed_deal: row.cost_per_closed_deal ?? 0,

      // Analysis
      recommendation: (row.recommendation || "MAINTAIN") as AdSummary["recommendation"],
      recommendation_reasoning: row.recommendation_reasoning || "",
      alert: row.alert || undefined,
      alert_reason: row.alert_reason || undefined,

      // Legacy aliases
      total_leads: row.emails_captured ?? 0,
      avg_cpl: row.cost_per_lead ?? 0,
      total_bookings: row.calls_booked ?? 0,
      booking_rate: row.show_up_rate ?? 0,
    }));

    return NextResponse.json(ads);
  } catch (error) {
    console.error("ad-performance GET error:", error);
    return NextResponse.json({ error: "Failed to load ad performance data" }, { status: 500 });
  }
}

// ── POST: Make sends ad data here after pulling from Meta + merging funnel ─────
//
// Make should POST an array of ad objects. Each object maps to one row.
// Make upserts by (ad_id, period_start, period_end) so re-running is safe.
//
// Expected body: { ads: AdPerformancePayload[] }
// OR a single object for a one-ad update: { ad_id, ... }
//
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Accept either { ads: [...] } or a bare array or a single object
    let rows: Record<string, unknown>[];
    if (Array.isArray(body)) {
      rows = body;
    } else if (Array.isArray(body.ads)) {
      rows = body.ads;
    } else {
      rows = [body];
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No ads in payload" }, { status: 400 });
    }

    // Normalise each row before upsert
    const upsertRows = rows.map((r) => ({
      ad_id: r.ad_id,
      ad_name: r.ad_name ?? null,
      campaign_id: r.campaign_id ?? null,
      campaign_name: r.campaign_name ?? null,
      adset_id: r.adset_id ?? null,
      adset_name: r.adset_name ?? null,
      period_start: r.period_start && String(r.period_start).trim() ? r.period_start : null,
      period_end: r.period_end && String(r.period_end).trim() ? r.period_end : null,
      status: r.status ?? "active",

      total_spend: num(r.total_spend ?? r.spend),
      impressions: int(r.impressions),
      clicks: int(r.clicks),
      avg_ctr: num(r.avg_ctr ?? r.ctr),
      avg_cpc: num(r.avg_cpc ?? r.cpc),
      avg_cpm: num(r.avg_cpm ?? r.cpm),
      frequency: num(r.frequency),

      cta_video_clicks: int(r.cta_video_clicks),
      emails_captured: int(r.emails_captured ?? r.leads),
      click_email_rate: num(r.click_email_rate),
      cost_per_lead: num(r.cost_per_lead ?? r.cpl),

      book_call_clicked: int(r.book_call_clicked),
      calls_booked: int(r.calls_booked),
      no_shows: int(r.no_shows),
      show_ups: int(r.show_ups),
      show_up_rate: num(r.show_up_rate),
      email_call_rate: num(r.email_call_rate),
      cost_per_booked_call: num(r.cost_per_booked_call),
      cost_per_actual_call: num(r.cost_per_actual_call),

      proposals_sent: int(r.proposals_sent),
      deals_closed: int(r.deals_closed),
      revenue: num(r.revenue),
      cost_per_closed_deal: num(r.cost_per_closed_deal),

      recommendation: r.recommendation ?? "MAINTAIN",
      recommendation_reasoning: r.recommendation_reasoning ?? null,
      alert: r.alert ?? null,
      alert_reason: r.alert_reason ?? null,

      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("ad_performance")
      .upsert(upsertRows, {
        onConflict: "ad_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: error.message, details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, upserted: upsertRows.length });
  } catch (error) {
    console.error("ad-performance POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
}

function int(v: unknown): number {
  const n = parseInt(String(v ?? 0), 10);
  return isNaN(n) ? 0 : n;
}

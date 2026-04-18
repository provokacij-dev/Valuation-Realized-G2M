import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PipelineRow, Lead, Engagement } from "@/types";

export async function GET() {
  try {
    const [leadsRes, engagementsRes] = await Promise.all([
      supabase.from("leads").select("*"),
      supabase.from("engagements").select("*"),
    ]);

    if (leadsRes.error) throw leadsRes.error;
    if (engagementsRes.error) throw engagementsRes.error;

    const leads = (leadsRes.data ?? []) as Lead[];
    const engagements = (engagementsRes.data ?? []) as Engagement[];

    const leadsByEmail = new Map<string, Lead>();
    for (const l of leads) {
      leadsByEmail.set(l.email.toLowerCase(), l);
    }

    const engagedEmails = new Set(
      engagements
        .map((e) => e.email?.toLowerCase())
        .filter((e): e is string => !!e)
    );

    const rows: PipelineRow[] = [];

    for (const e of engagements) {
      const matchingLead = leadsByEmail.get(e.email.toLowerCase());
      rows.push({
        source: "engagement",
        source_id: e.id,
        name: e.name,
        email: e.email,
        status: e.funnel_status ?? "call_booked",
        utm_term: e.utm_term ?? matchingLead?.utm_term ?? null,
        utm_content: e.utm_content ?? matchingLead?.utm_content ?? null,
        created_at: e.created_at,
        scheduled_at: e.scheduled_at,
        fit_score: e.fit_score,
        fit_reasoning: e.fit_reasoning,
        likely_objection: e.likely_objection,
        meeting_angle: e.meeting_angle,
        brief_doc_url: e.brief_doc_url,
        zoom_score: e.zoom_score,
        zoom_analysis: e.zoom_analysis,
        research: e.research,
        engagement_status: e.status,
        transcript_url: e.transcript_url,
      });
    }

    for (const l of leads) {
      if (engagedEmails.has(l.email.toLowerCase())) continue;
      rows.push({
        source: "lead",
        source_id: l.id,
        name: l.name,
        email: l.email,
        status: l.status,
        utm_term: l.utm_term,
        utm_content: l.utm_content,
        created_at: l.created_at,
        scheduled_at: null,
        fit_score: null,
        fit_reasoning: null,
        likely_objection: null,
        meeting_angle: null,
        brief_doc_url: null,
        zoom_score: null,
        zoom_analysis: null,
        research: null,
        engagement_status: null,
        transcript_url: null,
      });
    }

    rows.sort((a, b) => {
      const aKey = a.scheduled_at ?? a.created_at;
      const bKey = b.scheduled_at ?? b.created_at;
      return bKey.localeCompare(aKey);
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Pipeline read error:", error);
    return NextResponse.json(
      { error: "Failed to read pipeline" },
      { status: 500 }
    );
  }
}

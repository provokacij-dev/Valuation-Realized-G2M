import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getAnthropicClient } from "@/lib/anthropic";
import { buildGenerationPrompt } from "@/lib/prompts";
import { getSheetData } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import type { AdSummary, Rule, Skill, Brief, GeneratedAd, SkillUpdateProposal } from "@/types";

function parseSheetSummary(rows: string[][]): AdSummary[] {
  if (rows.length < 2) return [];
  // Skip header rows (handles single or double header row with section labels)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const KEYWORDS = ["impressions", "spend", "ctr", "clicks", "emails", "revenue", "deals"];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const flat = rows[i].map(norm).join(" ");
    if (KEYWORDS.filter((k) => flat.includes(k)).length >= 2) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx];
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) colMap[norm(h)] = i; });
  const dataRows = rows.slice(headerIdx + 1);
  const c = (row: string[], ...keys: string[]) => { for (const k of keys) { const idx = colMap[norm(k)]; if (idx !== undefined && row[idx]) return row[idx]; } return ""; };
  const n = (row: string[], ...keys: string[]) => parseFloat(c(row, ...keys)) || 0;
  return dataRows.filter((row) => row.some((r) => r.trim())).map((row) => {
    const emails_captured = n(row, "emails captured", "emails", "leads");
    const calls_booked    = n(row, "calls booked", "bookings");
    const cost_per_lead   = n(row, "cost per lead", "cpl");
    const show_up_rate    = n(row, "show up rate", "show-up rate");
    return {
      ad_id: c(row, "ad id", "ad_id") || c(row, "ad name", "name"),
      ad_name: c(row, "ad name", "name", "ad"),
      campaign_name: c(row, "campaign name", "campaign"),
      adset_name: c(row, "adset name", "ad set", "adset"),
      period: c(row, "date", "period"),
      status: (c(row, "status") || "active") as AdSummary["status"],
      total_spend: n(row, "ad spend", "spend"),
      impressions: n(row, "impressions"),
      clicks: n(row, "clicks"),
      avg_ctr: n(row, "ctr"),
      avg_cpc: n(row, "cpc"),
      avg_cpm: n(row, "cpm"),
      frequency: n(row, "frequency"),
      cta_video_clicks: n(row, "cta or video clicks", "cta clicks"),
      emails_captured,
      click_email_rate: n(row, "click email rate"),
      cost_per_lead,
      book_call_clicked: n(row, "book call clicked"),
      calls_booked,
      no_shows: n(row, "no shows", "no-shows"),
      show_ups: n(row, "show ups", "show-ups"),
      show_up_rate,
      email_call_rate: n(row, "email call rate"),
      cost_per_booked_call: n(row, "cost per booked call"),
      cost_per_actual_call: n(row, "cost per actual call"),
      proposals_sent: n(row, "proposals sent"),
      deals_closed: n(row, "deals closed", "deals"),
      revenue: n(row, "revenue"),
      cost_per_closed_deal: n(row, "cost per closed deal"),
      recommendation: (c(row, "recommendation") || "MAINTAIN") as AdSummary["recommendation"],
      recommendation_reasoning: c(row, "reasoning", "recommendation reasoning"),
      alert: c(row, "alert") || undefined,
      alert_reason: c(row, "alert reason") || undefined,
      total_leads: emails_captured,
      avg_cpl: cost_per_lead,
      total_bookings: calls_booked,
      booking_rate: show_up_rate,
    };
  });
}

function parseSheetRules(rows: string[][]): Rule[] {
  if (rows.length < 2) return [];
  const [, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.length > 0 && row[0])
    .map((row) => ({
      rule_id: row[0] || "",
      week: row[1] || "",
      creative_type: row[2] || "",
      hook_angle: row[3] || "",
      geo: row[4] || "",
      cpl: parseFloat(row[5]) || 0,
      ctr: parseFloat(row[6]) || 0,
      booking_rate: parseFloat(row[7]) || 0,
      signal: (row[8] as Rule["signal"]) || "TEST",
      rule_extracted: row[9] || "",
    }));
}

function parseSheetSkills(rows: string[][]): Skill[] {
  if (rows.length < 2) return [];
  const [, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.length > 0 && row[0] && row[3] === "active")
    .map((row) => ({
      rule_id: row[0] || "",
      category: (row[1] as Skill["category"]) || "Copy",
      instruction: row[2] || "",
      status: "active" as const,
      added_date: row[4] || "",
      modified_date: row[5] || "",
      source: row[6] || "",
      evidence: row[7] || "",
    }));
}

function buildSkillExtractionPrompt(ad: GeneratedAd): string {
  return `You are reviewing an approved Meta ad for Valuation Realized (M&A advisory for SME founders).

APPROVED AD:
Primary text: ${ad.primary_text}
Headline A: ${ad.headline_a}
Headline B: ${ad.headline_b}
Rationale: ${ad.rationale}

Based on this approved ad, identify 0-2 production skill candidates — specific, reusable copywriting rules that made this ad effective enough to approve.

Return ONLY valid JSON:
{
  "skill_updates": [
    {
      "type": "NEW",
      "category": "Copy",
      "proposed_instruction": "...",
      "evidence": "..."
    }
  ]
}

Rules for skill candidates:
- Only extract if the pattern is genuinely reusable (not ad-specific)
- "type": "NEW" for new rules, "AMEND" if it refines an existing known pattern
- "category": one of Copy, Visual, GCC, Audience, Format, Never-do
- Keep proposed_instruction under 100 words, actionable and specific
- If no reusable patterns, return { "skill_updates": [] }`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Extract skill action (from ad approval) ──────────────────────────────
    if (body.action === "extract_skill" && body.ad) {
      const ad = body.ad as GeneratedAd;
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: buildSkillExtractionPrompt(ad) }],
      });
      const content = response.content[0];
      if (content.type !== "text") return NextResponse.json({ skill_updates: [] });
      try {
        const text = content.text.replace(/^```json\n?|\n?```$/g, "").trim();
        const parsed = JSON.parse(text);
        const proposals = parsed.skill_updates ?? [];

        // Store proposals in Supabase (non-fatal on error)
        if (proposals.length > 0) {
          const { supabase } = await import("@/lib/supabase");
          await supabase.from("pending_skill_proposals").insert(
            proposals.map((p: SkillUpdateProposal) => ({
              type: p.type,
              rule_id: p.rule_id ?? null,
              category: p.category,
              proposed_instruction: p.proposed_instruction,
              current_instruction: p.current_instruction ?? null,
              evidence: p.evidence,
              status: "pending",
            }))
          );
        }

        return NextResponse.json({ skill_updates: proposals });
      } catch {
        return NextResponse.json({ skill_updates: [] });
      }
    }

    const brief: Brief = body.brief;
    const changeRequest: string | undefined = body.changeRequest;

    // Create a job record immediately and return the job_id
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .insert({ status: "pending", brief })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create generation job: ${jobError?.message ?? "unknown"}`);
    }

    // Run generation in background — Vercel keeps the lambda alive
    waitUntil(runGenerationJob(job.id, brief, changeRequest));

    return NextResponse.json({ job_id: job.id });
  } catch (error) {
    console.error("Generation error:", error);
    const message = error instanceof Error ? error.message : "Generation failed — try again";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runGenerationJob(jobId: string, brief: Brief, changeRequest?: string) {
  try {
    const [summaryRows, rulesRows, localSkillsRes] = await Promise.all([
      getSheetData("Summary").catch(() => []),
      getSheetData("Rules").catch(() => []),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://valuation-realized-g2-m.vercel.app"}/api/skills`)
        .then((r) => r.json())
        .catch(() => []),
    ]);

    const summary = parseSheetSummary(summaryRows);
    const rules = parseSheetRules(rulesRows);
    const skills: Skill[] = Array.isArray(localSkillsRes) && localSkillsRes.length > 0
      ? localSkillsRes.filter((s: Skill) => s.status === "active")
      : parseSheetSkills(await getSheetData("Production_Skill").catch(() => []));

    const effectiveBrief: Brief = changeRequest
      ? { ...brief, additionalInstruction: changeRequest, variantCount: 1 }
      : brief;

    const prompt = buildGenerationPrompt(skills, summary, rules, effectiveBrief);
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type from Claude");

    const text = content.text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed: { ads: Partial<GeneratedAd>[]; skill_updates: SkillUpdateProposal[] } = JSON.parse(text);

    const ads: GeneratedAd[] = (parsed.ads || []).map((ad, i) => ({
      id: `ad-${Date.now()}-${i}`,
      primary_text: ad.primary_text || "",
      headline_a: ad.headline_a || "",
      headline_b: ad.headline_b || "",
      headline_c: ad.headline_c || "",
      description: ad.description || "",
      image_direction: ad.image_direction || "",
      adset_tag: ad.adset_tag || "",
      rationale: ad.rationale || "",
      svg_prompt: ad.svg_prompt || "",
      status: "pending",
    }));

    await supabase.from("generation_jobs").update({
      status: "complete",
      ads,
      skill_updates: parsed.skill_updates || [],
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (err) {
    console.error("Generation job error:", err);
    await supabase.from("generation_jobs").update({
      status: "error",
      error: err instanceof Error ? err.message : "Generation failed",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

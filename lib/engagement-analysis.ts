import { supabase } from "./supabase";
import { getAnthropicClient } from "./anthropic";
import { appendFormattedAnalysis } from "./google-docs";
import { getZoomToken } from "./zoom";
import { sendTransactionalEmail } from "./brevo";
import type { ZoomAnalysisCategory } from "@/types";

// 31-category Zoom call analysis framework.
const ZOOM_CATEGORIES = [
  "Opening & rapport",
  "Agenda setting",
  "Discovery — business context",
  "Discovery — financial situation",
  "Discovery — motivations & goals",
  "Discovery — timeline & urgency",
  "Discovery — deal experience",
  "Objection — price / valuation expectations",
  "Objection — timing",
  "Objection — competitor comparison",
  "Objection — trust / credibility",
  "Objection — process concerns",
  "Pitch — value proposition clarity",
  "Pitch — differentiation",
  "Pitch — social proof / case studies",
  "Pitch — process explanation",
  "Pitch — fee structure discussion",
  "Engagement — active listening",
  "Engagement — question quality",
  "Engagement — energy & enthusiasm",
  "Engagement — empathy",
  "Next steps — clear CTA",
  "Next steps — timeline agreed",
  "Next steps — follow-up committed",
  "Red flags identified",
  "Deal qualification",
  "ICP alignment",
  "Relationship depth",
  "Buying signals",
  "Closing technique",
  "Overall call quality",
] as const;

function buildAnalysisPrompt(transcript: string): string {
  const categoriesList = ZOOM_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `You are an expert M&A sales coach reviewing a discovery/sales call transcript for Valuation Realized (an M&A advisory for SME founders).

Analyse this call across these 31 categories:
${categoriesList}

For each category, provide:
- score: 1-5 (1=poor, 3=adequate, 5=excellent)
- notes: 1-2 sentence specific observation

Also provide an overall_score (1-100) and top 3 coaching insights.

Return ONLY valid JSON in this exact format:
{
  "overall_score": <number 1-100>,
  "coaching_insights": ["insight1", "insight2", "insight3"],
  "categories": [
    {"category": "<name>", "score": <1-5>, "notes": "<observation>"},
    ...
  ]
}

TRANSCRIPT:
${transcript.slice(0, 50000)}`;
}

export type AnalysisResult = {
  success: boolean;
  zoom_score: number | null;
  zoom_analysis: ZoomAnalysisCategory[] | null;
  coaching_insights: string[];
  error?: string;
};

/**
 * Full post-call analysis pipeline for a single engagement:
 * download transcript from Zoom → run Claude 31-category scorecard →
 * update Supabase → append formatted analysis to the brief Google Doc →
 * send Brevo notification. All side effects are non-fatal (errors logged
 * but do not abort subsequent steps).
 *
 * Called synchronously by the manual /api/engagements/[id]/analyse endpoint
 * (user-clicked "Analyse" button) and asynchronously by the Zoom webhook via
 * waitUntil when a recording.completed event lands.
 */
export async function runEngagementAnalysis(engagementId: string): Promise<AnalysisResult> {
  // 1. Fetch engagement
  const { data: engagement, error: fetchErr } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", engagementId)
    .single();

  if (fetchErr || !engagement) {
    return {
      success: false,
      zoom_score: null,
      zoom_analysis: null,
      coaching_insights: [],
      error: "Engagement not found",
    };
  }

  if (!engagement.transcript_url) {
    return {
      success: false,
      zoom_score: null,
      zoom_analysis: null,
      coaching_insights: [],
      error: "No transcript URL on this engagement",
    };
  }

  // 2. Download transcript from Zoom (retry once on 401).
  let transcript: string;
  try {
    let token = await getZoomToken();
    let res = await fetch(engagement.transcript_url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      token = await getZoomToken();
      res = await fetch(engagement.transcript_url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!res.ok) {
      await supabase
        .from("engagements")
        .update({ status: "transcript_failed", updated_at: new Date().toISOString() })
        .eq("id", engagementId);
      return {
        success: false,
        zoom_score: null,
        zoom_analysis: null,
        coaching_insights: [],
        error: "Failed to download transcript",
      };
    }

    transcript = await res.text();
  } catch (err) {
    console.error("Transcript download error:", err);
    return {
      success: false,
      zoom_score: null,
      zoom_analysis: null,
      coaching_insights: [],
      error: "Transcript download failed",
    };
  }

  // 3. Claude 31-category analysis.
  let zoomScore: number | null = null;
  let zoomAnalysis: ZoomAnalysisCategory[] | null = null;
  let coachingInsights: string[] = [];

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: buildAnalysisPrompt(transcript) }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    const cleanText = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleanText);

    zoomScore = parsed.overall_score ?? null;
    zoomAnalysis = parsed.categories ?? null;
    coachingInsights = parsed.coaching_insights ?? [];
  } catch (err) {
    console.error("Claude analysis error:", err);
    // Continue with whatever we have so Supabase gets at least status=completed.
  }

  // 4. Update engagement record.
  await supabase
    .from("engagements")
    .update({
      status: "completed",
      zoom_score: zoomScore,
      zoom_analysis: zoomAnalysis,
      updated_at: new Date().toISOString(),
    })
    .eq("id", engagementId);

  // 5. Append formatted analysis section to the Google Doc (non-fatal).
  if (engagement.brief_doc_id && zoomAnalysis) {
    try {
      await appendFormattedAnalysis(engagement.brief_doc_id, {
        overallScore: zoomScore,
        insights: coachingInsights,
        categories: zoomAnalysis,
      });
    } catch (err) {
      console.error("Doc append error (non-fatal):", err);
    }
  }

  // 6. Brevo notification (non-fatal).
  const vaigaEmail = process.env.NOTIFICATION_EMAIL ?? "vaiga@valuationrealized.com";
  if (zoomScore !== null) {
    try {
      await sendTransactionalEmail({
        to: vaigaEmail,
        subject: `Call analysis ready: ${engagement.name ?? engagement.email} — ${zoomScore}/100`,
        htmlContent: `
          <h2>Zoom Call Analysis</h2>
          <p><strong>${engagement.name ?? engagement.email}</strong></p>
          <p><strong>Overall score: ${zoomScore}/100</strong></p>
          ${coachingInsights.length > 0 ? `
          <h3>Top Insights</h3>
          <ol>${coachingInsights.map((i) => `<li>${i}</li>`).join("")}</ol>
          ` : ""}
          ${engagement.brief_doc_url ? `<p><a href="${engagement.brief_doc_url}">Open Full Brief →</a></p>` : ""}
        `,
      });
    } catch (err) {
      console.error("Brevo notify error (non-fatal):", err);
    }
  }

  return {
    success: true,
    zoom_score: zoomScore,
    zoom_analysis: zoomAnalysis,
    coaching_insights: coachingInsights,
  };
}

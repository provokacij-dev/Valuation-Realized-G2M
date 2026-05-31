import { supabase } from "./supabase";
import { getAnthropicClient } from "./anthropic";
import { createSalesCallDoc, createTranscriptDoc, type SalesCallContent } from "./google-docs";
import { getZoomToken } from "./zoom";
import { sendInternalNotification } from "./email";
import { appendCallToMasterSummary } from "./call-summary-updater";

// Human-readable labels for the four allowed AI verdict values.
const VERDICT_LABELS: Record<string, string> = {
  win: "Win",
  potential_win: "Potential win",
  likely_loss: "Likely loss",
  loss: "Loss",
};

function buildSalesCallPrompt(transcript: string, priorResearch?: string | null): string {
  const researchBlock = priorResearch
    ? `\nPRIOR RESEARCH ON THIS PROSPECT (from pre-call brief — useful for sector/geography/business_summary; do NOT use it for revenue or profit figures):\n${priorResearch.slice(0, 3000)}\n`
    : "";

  return `You are a senior M&A advisor at Valuation Realized analysing a discovery call transcript with a prospect SME founder.${researchBlock}

CALL TRANSCRIPT:
${transcript.slice(0, 50000)}

Produce a structured post-call analysis as JSON. Follow these field rules strictly.

EXTRACT FACTS:
- sector: industry the business operates in. Use transcript first; fall back to prior research if needed.
- geography: primary country/region. Use transcript first; fall back to prior research.
- last_revenue: most recent annual revenue MENTIONED IN THE TRANSCRIPT (e.g. "$8M FY2024", "EUR 12M ARR"). NULL if not stated in the transcript. DO NOT infer or pull from prior research.
- last_profit: EBITDA / net profit / margin MENTIONED IN THE TRANSCRIPT. NULL if not stated. DO NOT infer or pull from prior research.
- indicative_valuation: any valuation discussed IN THE TRANSCRIPT — absolute, range, or multiple (e.g. "$20-30M", "5-7x EBITDA"). NULL if not discussed.
- business_summary: 1-2 sentences plainly describing what the business does. Transcript first; supplement with prior research if needed.
- pain_point: founder's ask or core pain point in their own words from the transcript (1-2 sentences).

OUTCOME VERDICT (judge from transcript only — pick exactly one):
- "win" — payment was committed/made on the call
- "potential_win" — strong willingness expressed but no payment yet
- "likely_loss" — soft objections (think about it, too expensive, timing)
- "loss" — hard pass, not the right offering, or no fit signals

Plus a 1-line outcome_rationale citing specific transcript moments.

CALL ANALYSIS:
- call_strengths: 2-4 bullets about what Vaiga did well (discovery, framing, listening, etc.). Plain text, one bullet per line, prefixed with "- ".
- call_improvements: 2-4 bullets about what Vaiga could have done better. Same format.

OUTPUT EXACTLY THIS JSON (no preamble, no trailing prose, no markdown fencing):
{
  "sector": "...",
  "geography": "...",
  "last_revenue": "...",
  "last_profit": "...",
  "indicative_valuation": "...",
  "business_summary": "...",
  "pain_point": "...",
  "outcome_verdict": "win|potential_win|likely_loss|loss",
  "outcome_rationale": "...",
  "call_strengths": "- bullet 1\\n- bullet 2",
  "call_improvements": "- bullet 1\\n- bullet 2"
}`;
}

type ExtractedFacts = {
  sector: string | null;
  geography: string | null;
  last_revenue: string | null;
  last_profit: string | null;
  indicative_valuation: string | null;
  business_summary: string | null;
  pain_point: string | null;
  outcome_verdict: "win" | "potential_win" | "likely_loss" | "loss" | null;
  outcome_rationale: string | null;
  call_strengths: string | null;
  call_improvements: string | null;
};

const EMPTY_FACTS: ExtractedFacts = {
  sector: null,
  geography: null,
  last_revenue: null,
  last_profit: null,
  indicative_valuation: null,
  business_summary: null,
  pain_point: null,
  outcome_verdict: null,
  outcome_rationale: null,
  call_strengths: null,
  call_improvements: null,
};

function isVerdict(v: unknown): v is "win" | "potential_win" | "likely_loss" | "loss" {
  return v === "win" || v === "potential_win" || v === "likely_loss" || v === "loss";
}

export type AnalysisResult = {
  success: boolean;
  sales_call_doc_url: string | null;
  outcome_verdict: ExtractedFacts["outcome_verdict"];
  error?: string;
};

/**
 * Post-call analysis pipeline for a single engagement:
 *   download transcript from Zoom
 *   → save raw transcript as a Google Doc in Sales calls folder
 *   → run Claude post-call extraction (business summary + verdict + coaching)
 *   → create a NEW Google Doc in the Sales calls folder (3-block layout)
 *   → update Supabase engagement row with extracted fields and doc URL
 *   → send Brevo notification email
 *   → append entry to master call summary Drive file
 *
 * All side effects after the analysis are non-fatal (errors logged but the
 * subsequent steps still attempt to run).
 *
 * Called both by the manual /api/engagements/[id]/analyse endpoint and by the
 * Zoom webhook via waitUntil after a recording.completed event.
 */
export async function runEngagementAnalysis(engagementId: string): Promise<AnalysisResult> {
  // 1. Fetch engagement
  const { data: engagement, error: fetchErr } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", engagementId)
    .single();

  if (fetchErr || !engagement) {
    return { success: false, sales_call_doc_url: null, outcome_verdict: null, error: "Engagement not found" };
  }

  if (!engagement.transcript_url) {
    return { success: false, sales_call_doc_url: null, outcome_verdict: null, error: "No transcript URL on this engagement" };
  }

  // 2. Download transcript from Zoom (retry once on 401, in case the Server-to-Server token
  //    expired between webhook receipt and analysis run).
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
      return { success: false, sales_call_doc_url: null, outcome_verdict: null, error: "Failed to download transcript" };
    }
    transcript = await res.text();
  } catch (err) {
    console.error("Transcript download error:", err);
    return { success: false, sales_call_doc_url: null, outcome_verdict: null, error: "Transcript download failed" };
  }

  // 2.5. Save raw transcript as a Google Doc in the Sales calls folder (non-fatal).
  try {
    const callDate = new Date(engagement.scheduled_at ?? engagement.created_at);
    const dd = String(callDate.getDate()).padStart(2, "0");
    const mm = String(callDate.getMonth() + 1).padStart(2, "0");
    const yyyy = callDate.getFullYear();
    const transcriptTitle = `${dd}/${mm}/${yyyy}, ${engagement.name ?? engagement.email}`;
    await createTranscriptDoc(transcriptTitle, transcript);
  } catch (err) {
    console.error("Transcript doc save error (non-fatal):", err);
  }

  // 3. Claude post-call extraction.
  let facts: ExtractedFacts = { ...EMPTY_FACTS };
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: buildSalesCallPrompt(transcript, engagement.research) }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    const cleanText = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleanText);
    facts = {
      sector: parsed.sector ?? null,
      geography: parsed.geography ?? null,
      last_revenue: parsed.last_revenue ?? null,
      last_profit: parsed.last_profit ?? null,
      indicative_valuation: parsed.indicative_valuation ?? null,
      business_summary: parsed.business_summary ?? null,
      pain_point: parsed.pain_point ?? null,
      outcome_verdict: isVerdict(parsed.outcome_verdict) ? parsed.outcome_verdict : null,
      outcome_rationale: parsed.outcome_rationale ?? null,
      call_strengths: parsed.call_strengths ?? null,
      call_improvements: parsed.call_improvements ?? null,
    };
  } catch (err) {
    console.error("Claude analysis error (non-fatal):", err);
  }

  // 4. Create new Sales Call doc in GOOGLE_CONDUCTEDSALES_CALLS_FOLDER_ID.
  let salesCallDocUrl: string | null = null;
  let salesCallDocId: string | null = null;
  try {
    const callDate = new Date(engagement.scheduled_at ?? engagement.created_at);
    const docTitle = `Sales call — ${engagement.name ?? engagement.email} — ${callDate.toLocaleDateString()}`;
    const verdictLabel = facts.outcome_verdict ? (VERDICT_LABELS[facts.outcome_verdict] ?? facts.outcome_verdict) : null;
    const content: SalesCallContent = {
      meta: {
        name: engagement.name,
        email: engagement.email,
        callDateDisplay: callDate.toLocaleString(),
      },
      businessSummary: {
        sector: facts.sector,
        geography: facts.geography,
        lastRevenue: facts.last_revenue,
        lastProfit: facts.last_profit,
        indicativeValuation: facts.indicative_valuation,
        summary: facts.business_summary,
        painPoint: facts.pain_point,
        outcomeVerdict: verdictLabel,
        outcomeRationale: facts.outcome_rationale,
      },
      callAnalysis: {
        strengths: facts.call_strengths,
        improvements: facts.call_improvements,
      },
      transcript,
    };
    const url = await createSalesCallDoc(docTitle, content);
    salesCallDocUrl = url;
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    salesCallDocId = match ? match[1] : null;
  } catch (err) {
    console.error("Sales call doc creation error (non-fatal):", err);
  }

  // 5. Update engagement row with extracted facts + doc references.
  await supabase
    .from("engagements")
    .update({
      status: "completed",
      sales_call_doc_url: salesCallDocUrl,
      sales_call_doc_id: salesCallDocId,
      sector: facts.sector,
      geography: facts.geography,
      last_revenue: facts.last_revenue,
      last_profit: facts.last_profit,
      indicative_valuation: facts.indicative_valuation,
      business_summary: facts.business_summary,
      pain_point: facts.pain_point,
      outcome_verdict: facts.outcome_verdict,
      outcome_rationale: facts.outcome_rationale,
      call_strengths: facts.call_strengths,
      call_improvements: facts.call_improvements,
      updated_at: new Date().toISOString(),
    })
    .eq("id", engagementId);

  // 6. Sales call analysis notification (non-fatal).
  const vaigaEmail = process.env.NOTIFICATION_EMAIL ?? "vr@valuationrealized.com";
  try {
    const verdictLabel = facts.outcome_verdict ? (VERDICT_LABELS[facts.outcome_verdict] ?? facts.outcome_verdict) : "Verdict unknown";
    await sendInternalNotification({
      to: vaigaEmail,
      subject: `Sales call analysis: ${engagement.name ?? engagement.email} — ${verdictLabel}`,
      htmlContent: `
        <h2>Sales Call Analysis</h2>
        <p><strong>${engagement.name ?? engagement.email}</strong></p>
        ${salesCallDocUrl ? `<p><strong><a href="${salesCallDocUrl}">Open Sales Call Doc &rarr;</a></strong></p>` : ""}
        ${facts.business_summary ? `<p><strong>Business:</strong> ${facts.business_summary}</p>` : ""}
        ${facts.pain_point ? `<p><strong>Pain point / ask:</strong> ${facts.pain_point}</p>` : ""}
        <p><strong>Outcome:</strong> ${verdictLabel}${facts.outcome_rationale ? ` — ${facts.outcome_rationale}` : ""}</p>
        ${facts.call_strengths ? `<h3>What went well</h3><pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${facts.call_strengths}</pre>` : ""}
        ${facts.call_improvements ? `<h3>What to improve</h3><pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${facts.call_improvements}</pre>` : ""}
      `,
    });
  } catch (err) {
    console.error("Sales call analysis notify error (non-fatal):", err);
  }

  // 7. Append to master call summary Drive file (non-fatal).
  try {
    await appendCallToMasterSummary(engagementId);
  } catch (err) {
    console.error("Master call summary append error (non-fatal):", err);
  }

  return {
    success: true,
    sales_call_doc_url: salesCallDocUrl,
    outcome_verdict: facts.outcome_verdict,
  };
}

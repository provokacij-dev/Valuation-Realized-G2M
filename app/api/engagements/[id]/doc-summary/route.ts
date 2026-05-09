import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractDocId, getDocPlainText } from "@/lib/google-docs";
import { listSalesCallDocs, findSalesCallDocByName } from "@/lib/google-drive";
import { getAnthropicClient } from "@/lib/anthropic";

/**
 * Read the engagement's matched sales call doc and ask Claude for:
 *   - a brief summary of what was discussed
 *   - the next steps that were agreed
 *
 * Used by the leads drawer when an engagement has a doc URL but no
 * AI-extracted summary fields (i.e. the doc was hand-written or matched by
 * name from Drive rather than produced by the Zoom→Claude pipeline).
 *
 * Lazy-loaded on drawer expand; not cached server-side. Component holds the
 * result in state so it isn't re-fetched while the row stays expanded.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: engagement, error } = await supabase
    .from("engagements")
    .select("id, name, sales_call_doc_id, sales_call_doc_url")
    .eq("id", id)
    .single();

  if (error || !engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  // Resolve the doc ID: prefer stored ID, fall back to URL parse, else Drive name-match.
  let docId: string | null = engagement.sales_call_doc_id ?? null;
  if (!docId && engagement.sales_call_doc_url) {
    docId = extractDocId(engagement.sales_call_doc_url);
  }
  if (!docId && engagement.name) {
    const files = await listSalesCallDocs();
    const match = findSalesCallDocByName(files, engagement.name);
    if (match) docId = match.id;
  }
  if (!docId) {
    return NextResponse.json({ error: "No sales call doc found for this engagement" }, { status: 404 });
  }

  let docText: string;
  try {
    docText = await getDocPlainText(docId);
  } catch (err) {
    console.error("Doc read error:", err);
    return NextResponse.json({ error: "Failed to read sales call doc" }, { status: 502 });
  }
  if (!docText) {
    return NextResponse.json({ summary: null, next_steps: null, doc_text_length: 0 });
  }

  const prompt = `You are reading sales call notes for Valuation Realized, an M&A advisory boutique.

Below is the content of a sales call doc (notes, transcript, or summary). Extract two short outputs and return them as strict JSON with these exact keys:

{
  "summary": "2-4 sentence brief summary of what was discussed on the call: who the client is, their business in one line, and the key topic/ask",
  "next_steps": "the next steps agreed at the end of the call as a short bulleted list (one item per line, no bullet characters — the UI adds them). If no next steps were agreed, return null."
}

Rules:
- Be concrete and specific. Use the exact figures and names mentioned in the doc.
- "summary" must be plain prose, not bullets.
- "next_steps" must be one action per line, no leading dashes, no numbering.
- Return null for fields that genuinely aren't in the doc.
- Return ONLY the JSON object — no markdown fences, no preamble.

DOC CONTENT:
"""
${docText}
"""`;

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "{}";
    const cleanText = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleanText);
    return NextResponse.json({
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      next_steps: typeof parsed.next_steps === "string" ? parsed.next_steps : null,
    });
  } catch (err) {
    console.error("Claude doc summary error:", err);
    return NextResponse.json({ error: "Failed to summarise sales call doc" }, { status: 502 });
  }
}

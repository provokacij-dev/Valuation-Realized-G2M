import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/anthropic";
import { createBriefDoc } from "@/lib/google-docs";
import { sendTransactionalEmail } from "@/lib/brevo";

// ── Signature verification ───────────────────────────────────────────────────

function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  // Header format: t=<timestamp>,v1=<signature>
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Replay attack protection — reject if older than 5 minutes
  const age = Date.now() / 1000 - parseInt(timestamp, 10);
  if (age > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// ── Research prompt ─────────────────────────────────────────────────────────

function buildResearchPrompt(name: string, email: string, scheduledAt: string): string {
  const domain = email.split("@")[1] ?? "";
  return `You are a pre-meeting research assistant for Valuation Realized, an M&A advisory firm specialising in SME founder exits.

Invitee: ${name} (${email})
Company domain: ${domain}
Meeting time: ${scheduledAt}

Research this person and their company. Provide:
1. 3-5 bullet points of key background (company stage, size, industry, any public signals)
2. Likely deal readiness / exit signals
3. Potential objections or sensitivities

Then output a JSON block on its own line:
{"fit_score":X,"fit_reasoning":"...","likely_objection":"...","meeting_angle":"..."}

Where:
- fit_score: 1-10 alignment with VR's ICP (M&A-ready SME founder, deal size $2M-$50M)
- fit_reasoning: one sentence on score rationale
- likely_objection: the most likely pushback in the first meeting
- meeting_angle: recommended opening angle for Vaiga

Keep the research section concise (under 300 words). The JSON must be valid and on its own line.`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Must use text() to preserve raw body for HMAC verification
  const rawBody = await request.text();
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;

  // Only verify if a signing secret is configured (paid Calendly plan feature)
  if (secret) {
    const signatureHeader = request.headers.get("Calendly-Webhook-Signature");
    if (!verifyCalendlySignature(rawBody, signatureHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: {
    event: string;
    payload: {
      event?: { name?: string; start_time?: string };
      invitee?: { name?: string; email?: string };
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process invitee.created events
  if (payload.event !== "invitee.created") {
    return NextResponse.json({ received: true });
  }

  const invitee = payload.payload.invitee;
  const event = payload.payload.event;
  const name = invitee?.name ?? "Unknown";
  const email = (invitee?.email ?? "").toLowerCase().trim();
  const scheduledAt = event?.start_time ?? new Date().toISOString();

  if (!email) {
    return NextResponse.json({ error: "Missing invitee email" }, { status: 400 });
  }

  // Insert engagement immediately — return 200 fast regardless of downstream failures
  const { data: inserted, error: dbError } = await supabase
    .from("engagements")
    .insert({
      name,
      email,
      scheduled_at: scheduledAt,
      status: "booked",
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("Engagement insert error:", dbError);
    return NextResponse.json({ error: "Failed to save engagement" }, { status: 500 });
  }

  const engagementId = inserted.id;

  // Async: Claude research + Google Doc + Brevo notify (errors don't fail webhook)
  void runPostBookingTasks(engagementId, name, email, scheduledAt);

  return NextResponse.json({ received: true });
}

async function runPostBookingTasks(
  engagementId: string,
  name: string,
  email: string,
  scheduledAt: string
) {
  let research: string | null = null;
  let fitScore: number | null = null;
  let fitReasoning: string | null = null;
  let likelyObjection: string | null = null;
  let meetingAngle: string | null = null;
  let briefDocUrl: string | null = null;
  let briefDocId: string | null = null;

  // 1. Claude research
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildResearchPrompt(name, email, scheduledAt) }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";

    // Extract JSON block from last line or inline
    const jsonMatch = text.match(/\{[^}]*"fit_score"[^}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        fitScore = typeof parsed.fit_score === "number" ? parsed.fit_score : null;
        fitReasoning = parsed.fit_reasoning ?? null;
        likelyObjection = parsed.likely_objection ?? null;
        meetingAngle = parsed.meeting_angle ?? null;
      } catch {}
    }

    // Research is the text minus the JSON block
    research = text.replace(/\{[^}]*"fit_score"[^}]*\}/, "").trim();
  } catch (err) {
    console.error("Claude research error (non-fatal):", err);
  }

  // 2. Google Doc
  try {
    const docContent = [
      `Meeting Brief: ${name}`,
      `Email: ${email}`,
      `Scheduled: ${new Date(scheduledAt).toLocaleString()}`,
      "",
      "=== RESEARCH ===",
      research ?? "(Research unavailable)",
      "",
      "=== LEAD SCORING ===",
      `Fit Score: ${fitScore ?? "N/A"}/10`,
      `Reasoning: ${fitReasoning ?? "N/A"}`,
      `Likely Objection: ${likelyObjection ?? "N/A"}`,
      `Meeting Angle: ${meetingAngle ?? "N/A"}`,
    ].join("\n");

    const url = await createBriefDoc(`Brief: ${name} — ${new Date(scheduledAt).toLocaleDateString()}`, docContent);
    briefDocUrl = url;
    // Extract doc ID from URL
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    briefDocId = match ? match[1] : null;
  } catch (err) {
    console.error("Google Doc creation error (non-fatal):", err);
  }

  // 3. Update engagement record
  await supabase
    .from("engagements")
    .update({
      research,
      fit_score: fitScore,
      fit_reasoning: fitReasoning,
      likely_objection: likelyObjection,
      meeting_angle: meetingAngle,
      brief_doc_url: briefDocUrl,
      brief_doc_id: briefDocId,
    })
    .eq("id", engagementId);

  // 4. Brevo notification to Vaiga
  const vaigaEmail = process.env.NOTIFICATION_EMAIL ?? "vaiga@valuationrealized.com";
  try {
    await sendTransactionalEmail({
      to: vaigaEmail,
      subject: `New booking: ${name} — ${new Date(scheduledAt).toLocaleDateString()}`,
      htmlContent: `
        <h2>New Calendly Booking</h2>
        <p><strong>${name}</strong> (${email}) booked for ${new Date(scheduledAt).toLocaleString()}</p>
        <p><strong>Fit score:</strong> ${fitScore ?? "N/A"}/10</p>
        <p><strong>Meeting angle:</strong> ${meetingAngle ?? "N/A"}</p>
        ${briefDocUrl ? `<p><a href="${briefDocUrl}">Open Meeting Brief →</a></p>` : ""}
      `,
    });
  } catch (err) {
    console.error("Brevo notify error (non-fatal):", err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/anthropic";
import { createBriefDoc } from "@/lib/google-docs";
import { sendTransactionalEmail } from "@/lib/brevo";
import { formatQuestionBankForPrompt } from "@/lib/question-bank";

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

// ── Personal email detection ─────────────────────────────────────────────────

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "aol.com", "mail.com", "gmx.com", "yandex.com", "yandex.ru",
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

// ── Research prompt ─────────────────────────────────────────────────────────

function buildResearchPrompt(
  name: string,
  email: string,
  scheduledAt: string,
  phone: string | null,
  questionsAndAnswers: { question: string; answer: string }[]
): string {
  const domain = email.split("@")[1] ?? "";
  const qaSection = questionsAndAnswers.length > 0
    ? "\nQualifying answers from booking form:\n" +
      questionsAndAnswers.map((qa) => `- ${qa.question}: ${qa.answer}`).join("\n")
    : "";
  return `You are a pre-meeting research assistant for Valuation Realized, an M&A advisory firm specialising in SME founder exits.

Invitee: ${name} (${email})${phone ? `\nPhone: ${phone}` : ""}
Company domain: ${domain}
Meeting time: ${scheduledAt}${qaSection}

## TASK 1 — Identity verification & research

**Step 1 — Search for the person.** Use ALL of the following search queries (the email username often contains the person's name or nickname):
- Full name: "${name}"
- Email username as a search term: "${email.split("@")[0]}"${phone ? `\n- Phone number: "${phone}"` : ""}
- Name + LinkedIn, Name + company, Name + UAE/Dubai/region if applicable

Search thoroughly before concluding anything. Many legitimate founders use Gmail. The email prefix often reveals the real name (e.g. "maco.moumen" → search "Maco Moumen").

**Step 2 — Research findings.** Based on what you find, provide:
1. 3-5 bullet points of key background (company, stage, size, industry, any public signals — LinkedIn, website, news, etc.)
2. Likely deal readiness / exit signals from their answers and background
3. Potential objections or sensitivities

**Step 3 — Legitimacy assessment.** After searching, assess identity confidence:
- HIGH: Found LinkedIn, company website, news, or other verifiable public presence
- MEDIUM: Found partial signals (social media, directory listings, phone lookup, regional business presence)
- LOW: Genuinely no findable information after searching name, email username, and phone

Do NOT default to LOW just because the email is Gmail. Gmail is common among legitimate founders in emerging markets (UAE, KSA, Africa, etc.).

## TASK 2 — Curate diagnostic questions
Below is the full question bank used in the discovery call, split into 6 domains. For each domain:
- Select the 4-6 questions MOST relevant to this specific invitee's business
- Add 1-2 sector-specific questions if the invitee's industry warrants it (e.g. for a smart home installer: "Do you install and resell, or do you R&D and manufacture?"; for a SaaS company: "What is your ARR and MRR split?")
- Omit questions that are clearly not applicable (e.g. skip tech stack questions for a pure services business)

Output the curated questions as a JSON block on its own line after the research, using this exact format:
{"curated_questions":{"leadership":["q1","q2",...],"commercial":["q1","q2",...],"financial":["q1","q2",...],"operations":["q1","q2",...],"legal":["q1","q2",...],"technology":["q1","q2",...]}}

## TASK 3 — Scoring
Then output a second JSON block on its own line:
{"fit_score":X,"fit_reasoning":"...","likely_objection":"...","meeting_angle":"...","public_info_found":true/false,"identity_confidence":"HIGH/MEDIUM/LOW","identity_notes":"..."}

Where:
- fit_score: 1-10 alignment with VR's ICP (M&A-ready SME founder, deal size $2M-$50M)
- fit_reasoning: one sentence on score rationale
- likely_objection: the most likely pushback in the first meeting
- meeting_angle: recommended opening angle for Vaiga
- public_info_found: true if you found ANY verifiable signal (name match, company, LinkedIn, phone); false only if completely ungoogleable after thorough search
- identity_confidence: HIGH / MEDIUM / LOW as defined above
- identity_notes: one sentence summarising what you found (or didn't find) about their identity

Keep the research section concise (under 300 words). Both JSON blocks must be valid and each on its own line.

## FULL QUESTION BANK

${formatQuestionBankForPrompt()}`;
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
      invitee?: {
        name?: string;
        email?: string;
        text_reminder_number?: string;
        timezone?: string;
        questions_and_answers?: { question: string; answer: string }[];
      };
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
  const phone = invitee?.text_reminder_number ?? null;
  const timezone = invitee?.timezone ?? "UTC";
  const questionsAndAnswers = invitee?.questions_and_answers ?? [];

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

  // Keep lambda alive until background tasks complete (waitUntil prevents Vercel from killing the function)
  waitUntil(runPostBookingTasks(engagementId, name, email, scheduledAt, phone, timezone, questionsAndAnswers));

  return NextResponse.json({ received: true });
}

async function runPostBookingTasks(
  engagementId: string,
  name: string,
  email: string,
  scheduledAt: string,
  phone: string | null,
  timezone: string,
  questionsAndAnswers: { question: string; answer: string }[]
) {
  let research: string | null = null;
  let fitScore: number | null = null;
  let fitReasoning: string | null = null;
  let likelyObjection: string | null = null;
  let meetingAngle: string | null = null;
  let publicInfoFound: boolean = true;
  let identityConfidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
  let identityNotes: string | null = null;
  let briefDocUrl: string | null = null;
  let briefDocId: string | null = null;
  let curatedQuestions: Record<string, string[]> | null = null;

  const personalEmail = isPersonalEmail(email);

  // 1. Claude research + question curation
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: buildResearchPrompt(name, email, scheduledAt, phone, questionsAndAnswers) }],
    });

    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("\n");

    // Extract curated questions JSON
    const curatedMatch = text.match(/\{"curated_questions":\{[\s\S]*?\}\}/);
    if (curatedMatch) {
      try {
        const parsed = JSON.parse(curatedMatch[0]);
        curatedQuestions = parsed.curated_questions ?? null;
      } catch {}
    }

    // Extract scoring JSON
    const scoringMatch = text.match(/\{"fit_score"[\s\S]*?\}/);
    if (scoringMatch) {
      try {
        const parsed = JSON.parse(scoringMatch[0]);
        fitScore = typeof parsed.fit_score === "number" ? parsed.fit_score : null;
        fitReasoning = parsed.fit_reasoning ?? null;
        likelyObjection = parsed.likely_objection ?? null;
        meetingAngle = parsed.meeting_angle ?? null;
        publicInfoFound = parsed.public_info_found !== false;
        identityConfidence = ["HIGH", "MEDIUM", "LOW"].includes(parsed.identity_confidence) ? parsed.identity_confidence : "HIGH";
        identityNotes = parsed.identity_notes ?? null;
      } catch {}
    }

    // Research is the text minus both JSON blocks
    research = text
      .replace(/\{"curated_questions":\{[\s\S]*?\}\}/, "")
      .replace(/\{"fit_score"[\s\S]*?\}/, "")
      .trim();
  } catch (err) {
    console.error("Claude research error (non-fatal):", err);
  }

  // Shared lookup used in both Google Doc and email
  const domainLabels: Record<string, string> = {
    leadership: "Leadership & People",
    commercial: "Commercial",
    financial: "Financial",
    operations: "Operations",
    legal: "Legal",
    technology: "Technology & Data",
  };

  // 2. Google Doc
  try {
    const qaLines = questionsAndAnswers.length > 0
      ? [
          "",
          "=== BOOKING FORM ANSWERS ===",
          ...questionsAndAnswers.map((qa) => `${qa.question}: ${qa.answer}`),
        ]
      : [];

    const curatedQLines: string[] = [];
    if (curatedQuestions) {
      curatedQLines.push("", "=== CURATED DIAGNOSTIC QUESTIONS ===");
      for (const [domain, qs] of Object.entries(curatedQuestions)) {
        curatedQLines.push(`\n[${domainLabels[domain] ?? domain}]`);
        (qs as string[]).forEach((q, i) => curatedQLines.push(`${i + 1}. ${q}`));
      }
    }

    const docContent = [
      `Meeting Brief: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      `Scheduled: ${new Date(scheduledAt).toLocaleString()}`,
      ...qaLines,
      "",
      "=== RESEARCH ===",
      research ?? "(Research unavailable)",
      "",
      "=== LEAD SCORING ===",
      `Fit Score: ${fitScore ?? "N/A"}/10`,
      `Reasoning: ${fitReasoning ?? "N/A"}`,
      `Likely Objection: ${likelyObjection ?? "N/A"}`,
      `Meeting Angle: ${meetingAngle ?? "N/A"}`,
      ...curatedQLines,
    ].filter(Boolean).join("\n");

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
    // Derive company name from email domain (e.g. tcsldubai.com → TCSL Dubai)
    const emailDomain = email.split("@")[1] ?? "";
    const companyName = emailDomain
      .replace(/\.(com|co|net|org|io|ae|uk|au|de|fr|sg)(\.\w+)?$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const meetingDate = new Date(scheduledAt);
    const dateStr = meetingDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: timezone });
    const timeStr = meetingDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
    const tzAbbr = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(meetingDate)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone;

    const curatedQHtml = curatedQuestions
      ? Object.entries(curatedQuestions)
          .map(([domain, qs]) =>
            `<h4>${domainLabels[domain] ?? domain}</h4><ol>${(qs as string[]).map((q) => `<li>${q}</li>`).join("")}</ol>`
          )
          .join("")
      : "";

    // Flag as suspicious only when personal email AND Claude found LOW identity confidence after web search
    const isSuspicious = personalEmail && identityConfidence === "LOW";
    // Show a softer notice for MEDIUM confidence with personal email
    const isMediumRisk = personalEmail && identityConfidence === "MEDIUM";

    const suspiciousBanner = isSuspicious ? `
      <div style="background:#fff3cd;border:2px solid #e6a817;border-radius:6px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:#7d4e00;">⚠️ POTENTIAL ROGUE / FAKE BOOKING</p>
        <p style="margin:0 0 6px;color:#5a3a00;">Personal email + no verifiable public identity found after web search.</p>
        ${identityNotes ? `<p style="margin:4px 0;color:#5a3a00;font-size:13px;"><em>${identityNotes}</em></p>` : ""}
        <p style="margin:8px 0 0;color:#5a3a00;font-size:13px;">Recommend: WhatsApp the number before the call to confirm identity and company.</p>
      </div>` : isMediumRisk ? `
      <div style="background:#e8f4fd;border:2px solid #5b9bd5;border-radius:6px;padding:12px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#1a4a7a;">ℹ️ VERIFY IDENTITY</p>
        <p style="margin:0;color:#1a3a5c;font-size:13px;">Personal email with partial public presence. ${identityNotes ?? ""} Consider a quick WhatsApp to confirm.</p>
      </div>` : "";

    await sendTransactionalEmail({
      to: vaigaEmail,
      subject: `${isSuspicious ? "⚠️ " : isMediumRisk ? "ℹ️ " : ""}Sales brief - ${name}, ${companyName}, ${dateStr}, ${timeStr} ${tzAbbr}`,
      htmlContent: `
        ${suspiciousBanner}
        <h2>Sales Brief: ${name}, ${companyName}</h2>
        <p><strong>Email:</strong> ${email}${phone ? ` &nbsp;·&nbsp; <strong>Phone:</strong> ${phone}` : ""}</p>
        <p><strong>Meeting:</strong> ${new Date(scheduledAt).toLocaleString()}</p>
        ${briefDocUrl ? `<p><strong><a href="${briefDocUrl}">Open Google Doc Brief →</a></strong></p>` : ""}
        <hr/>
        <p><strong>Fit score:</strong> ${fitScore ?? "N/A"}/10 — ${fitReasoning ?? ""}</p>
        <p><strong>Likely objection:</strong> ${likelyObjection ?? "N/A"}</p>
        <p><strong>Meeting angle:</strong> ${meetingAngle ?? "N/A"}</p>
        ${curatedQHtml ? `<hr/><h3>Curated diagnostic questions</h3>${curatedQHtml}` : ""}
      `,
    });
  } catch (err) {
    console.error("Brevo notify error (non-fatal):", err);
  }
}

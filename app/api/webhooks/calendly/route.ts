import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/anthropic";
import { createFormattedBriefDoc } from "@/lib/google-docs";
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
  questionsAndAnswers: { question: string; answer: string }[],
  searchContext: string = ""
): string {
  const domain = email.split("@")[1] ?? "";
  const emailUsername = email.split("@")[0];
  const qaSection = questionsAndAnswers.length > 0
    ? "\nQualifying answers from booking form:\n" +
      questionsAndAnswers.map((qa) => `- ${qa.question}: ${qa.answer}`).join("\n")
    : "";
  const searchSection = searchContext
    ? `\n\n## PRE-FETCHED SEARCH RESULTS (use these as your primary research source)\n${searchContext}`
    : "";
  return `You are a pre-meeting research assistant for Valuation Realized, an M&A advisory firm specialising in SME founder exits.

Invitee: ${name} (${email})${phone ? `\nPhone: ${phone}` : ""}
Email username: ${emailUsername}
Company domain: ${domain}
Meeting time: ${scheduledAt}${qaSection}${searchSection}

## TASK 1 — Identity verification & research

${searchContext ? `Pre-fetched search results are provided above. Use them as your PRIMARY source. If they clearly identify the person and company, do not search further — just analyse what's there.` : `Use web_search to search for: "${name}", "${emailUsername}"${phone ? `, "${phone}"` : ""}. The email username often IS the person's name (e.g. "maco.moumen" → person is "Maco Moumen", company is "MACO"). Search before concluding anything.`}

**Research findings** — based on the search results or web search above:
1. 3-5 bullet points of key background (company name, stage, size, industry, any LinkedIn/website/news found)
2. Likely deal readiness / exit signals
3. Potential objections or sensitivities

**Identity confidence:**
- HIGH: Found LinkedIn, company website, news, or other verifiable presence
- MEDIUM: Found partial signals (social media, directories, phone lookup)
- LOW: Genuinely nothing found after searching name, email username, AND phone

Do NOT default to LOW just because the email is Gmail. Gmail is common among legitimate founders in emerging markets (UAE, KSA, Africa, Egypt, etc.).

## TASK 2 — Sector-specific diagnostic questions

Generate EXACTLY 5 questions that probe value drivers and risks UNIQUE to this specific business / sector / geography.

**Rules:**
- Each question MUST reference something concrete: the company's sector, revenue model, geography, stated booking-form answers, or macro drivers (e.g. KSA giga-projects like NEOM / Red Sea / Diriyah, Vision 2030 pipeline, UAE corporate tax, commodity cycle, carbon pricing).
- DO NOT ask generic M&A-readiness questions (management team depth, financial reporting quality, generic customer concentration, systems/processes, owner dependency, three-month absence tests). Those live on a separate checklist.
- Each question should feel researched — one Vaiga could NOT have asked a random SME owner without knowing the business.

Good example: "Are your revenues tied to specific KSA giga-projects (NEOM, Red Sea, Diriyah) — and what is the pipeline once those projects complete?"
Bad example: "Do you have a management team that could run the business if you stepped back for three months?"

Output as a JSON block on its own line (flat array of 5 strings):
{"curated_questions":["q1","q2","q3","q4","q5"]}

## TASK 3 — Valuation levers for this sector

Identify 3-5 UPSIDE and 3-5 DOWNSIDE valuation levers specific to this sector / geography. Think like an M&A advisor briefing a seller: what specifically in THIS industry drives a buyer to pay a higher multiple, and what drives them to push back / discount?

Each lever: 1-2 sentences, concrete, sector-specific (not generic "recurring revenue is good").

Output as a JSON block on its own line:
{"valuation_levers":{"upside":["lever1","lever2","lever3"],"downside":["lever1","lever2","lever3"]}}

## TASK 4 — Scoring

Output a third JSON block on its own line:
{"fit_score":X,"fit_reasoning":"...","likely_objection":"...","meeting_angle":"...","public_info_found":true/false,"identity_confidence":"HIGH/MEDIUM/LOW","identity_notes":"..."}

Where:
- fit_score: 1-10 alignment with VR's ICP (M&A-ready SME founder, deal size $2M-$50M)
- fit_reasoning: one sentence on score rationale
- likely_objection: the most likely pushback in the first meeting
- meeting_angle: recommended opening angle for Vaiga
- public_info_found: true if you found ANY verifiable signal; false only if completely ungoogleable
- identity_confidence: HIGH / MEDIUM / LOW as defined above
- identity_notes: one sentence summarising what you found

Keep the research section concise (under 300 words). All three JSON blocks must be valid and each on its own line.`;
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
      event?: {
        name?: string;
        start_time?: string;
        location?: { type?: string; join_url?: string };
      };
      scheduled_event?: {
        name?: string;
        start_time?: string;
        location?: { type?: string; join_url?: string };
      };
      invitee?: {
        name?: string;
        email?: string;
        text_reminder_number?: string;
        timezone?: string;
        questions_and_answers?: { question: string; answer: string }[];
      };
      // Calendly v2 also puts invitee fields flat on payload.payload (no .invitee
      // nesting). Declare them here so the `invitee ?? payload.payload` fallback
      // typechecks.
      name?: string;
      email?: string;
      text_reminder_number?: string;
      timezone?: string;
      questions_and_answers?: { question: string; answer: string }[];
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

  // Calendly v2 sends invitee fields flat on payload.payload; our canary/test
  // shape nests them under .invitee. Accept both.
  const invitee = payload.payload.invitee ?? payload.payload;
  // Accept either shape: `payload.event` (our simplified/test shape) or
  // `payload.scheduled_event` (Calendly v2 webhook shape).
  const event = payload.payload.event ?? payload.payload.scheduled_event;
  const name = invitee?.name ?? "Unknown";
  const email = (invitee?.email ?? "").toLowerCase().trim();
  const scheduledAt = event?.start_time ?? new Date().toISOString();
  const phone = invitee?.text_reminder_number ?? null;
  const timezone = invitee?.timezone ?? "UTC";
  const questionsAndAnswers = invitee?.questions_and_answers ?? [];

  // Zoom meeting ID from the event location's join URL (e.g.
  // "https://us06web.zoom.us/j/81191421252?pwd=..." → "81191421252").
  // Used by the Zoom recording.completed webhook to match back to this
  // engagement.
  const joinUrl = event?.location?.join_url ?? null;
  const zoomMeetingIdMatch = joinUrl?.match(/\/j\/(\d+)/);
  const zoomMeetingId = zoomMeetingIdMatch ? zoomMeetingIdMatch[1] : null;

  if (!email) {
    return NextResponse.json({ error: "Missing invitee email" }, { status: 400 });
  }

  // Calendly retries on slow responses, producing duplicate engagement rows.
  // Same (email, scheduled_at) means same booking — short-circuit before spending
  // Tavily / Claude / Google Docs / Brevo quota on a retry.
  const { data: existingDup } = await supabase
    .from("engagements")
    .select("id")
    .eq("email", email)
    .eq("scheduled_at", scheduledAt)
    .maybeSingle();

  if (existingDup) {
    return NextResponse.json({ received: true, dedup: true });
  }

  // Pull UTMs from the matching lead (if any) so pipeline attribution survives
  // even if the lead row is later deleted.
  const { data: matchingLead } = await supabase
    .from("leads")
    .select("utm_term, utm_content")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  // Insert engagement immediately — return 200 fast regardless of downstream failures
  const { data: inserted, error: dbError } = await supabase
    .from("engagements")
    .insert({
      name,
      email,
      scheduled_at: scheduledAt,
      status: "booked",
      zoom_meeting_id: zoomMeetingId,
      utm_term: matchingLead?.utm_term ?? null,
      utm_content: matchingLead?.utm_content ?? null,
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
  let curatedQuestions: string[] | null = null;
  let valuationLevers: { upside?: string[]; downside?: string[] } | null = null;

  const personalEmail = isPersonalEmail(email);

  // 1. Tavily pre-research (if API key available)
  let searchContext = "";
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    const emailUsername = email.split("@")[0];
    const queries = [...new Set([name, emailUsername])];
    for (const q of queries) {
      try {
        const r = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavilyKey, query: q, max_results: 5, search_depth: "basic" }),
        });
        if (r.ok) {
          const data = await r.json() as { results?: { title: string; content: string; url: string }[] };
          const results = data?.results ?? [];
          if (results.length > 0) {
            searchContext += `\nSearch results for "${q}":\n` +
              results.map((r) => `- ${r.title}: ${r.content.slice(0, 200)} (${r.url})`).join("\n");
          }
        }
      } catch {}
    }
  }

  // 2. Claude research + question curation
  try {
    const client = getAnthropicClient();

    const prompt = buildResearchPrompt(name, email, scheduledAt, phone, questionsAndAnswers, searchContext);

    // Single call — web_search_20250305 is server-executed by Anthropic, returns end_turn directly
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("\n").trim();

    // Extract curated questions JSON (flat array of 5 strings)
    const curatedMatch = text.match(/\{"curated_questions":\s*\[[\s\S]*?\]\s*\}/);
    if (curatedMatch) {
      try {
        const parsed = JSON.parse(curatedMatch[0]);
        curatedQuestions = Array.isArray(parsed.curated_questions) ? parsed.curated_questions : null;
      } catch {}
    }

    // Extract valuation levers JSON
    const leversMatch = text.match(/\{"valuation_levers":\{[\s\S]*?\}\}/);
    if (leversMatch) {
      try {
        const parsed = JSON.parse(leversMatch[0]);
        valuationLevers = parsed.valuation_levers ?? null;
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

    // Research is the text minus all three JSON blocks
    research = text
      .replace(/\{"curated_questions":\s*\[[\s\S]*?\]\s*\}/, "")
      .replace(/\{"valuation_levers":\{[\s\S]*?\}\}/, "")
      .replace(/\{"fit_score"[\s\S]*?\}/, "")
      .trim();
  } catch (err) {
    console.error("Claude research error (non-fatal):", err);
  }

  // 2. Google Doc (formatted: HEADING_1 title, HEADING_2 sections, numbered questions, levers table)
  try {
    const docTitle = `Brief: ${name} — ${new Date(scheduledAt).toLocaleDateString()}`;
    const url = await createFormattedBriefDoc(docTitle, {
      meta: {
        email,
        phone,
        scheduledDisplay: new Date(scheduledAt).toLocaleString(),
      },
      bookingAnswers: questionsAndAnswers,
      research: research ?? "(Research unavailable)",
      scoring: {
        fitScore,
        fitReasoning,
        likelyObjection,
        meetingAngle,
      },
      questions: curatedQuestions ?? [],
      levers: valuationLevers,
    });
    briefDocUrl = url;
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
  const vaigaEmail = process.env.NOTIFICATION_EMAIL ?? "vr@valuationrealized.com";
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

    const curatedQHtml = curatedQuestions && curatedQuestions.length > 0
      ? `<ol>${curatedQuestions.map((q) => `<li style="margin-bottom:6px;">${q}</li>`).join("")}</ol>`
      : "";

    let leversHtml = "";
    if (valuationLevers) {
      const up = valuationLevers.upside ?? [];
      const dn = valuationLevers.downside ?? [];
      if (up.length || dn.length) {
        const n = Math.max(up.length, dn.length);
        let rows = "";
        for (let i = 0; i < n; i++) {
          rows += `<tr><td style="border:1px solid #ddd;padding:10px;vertical-align:top;width:50%;">${up[i] ?? ""}</td><td style="border:1px solid #ddd;padding:10px;vertical-align:top;width:50%;">${dn[i] ?? ""}</td></tr>`;
        }
        leversHtml = `<hr/><h3>Valuation levers for this sector</h3>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <thead><tr>
              <th style="border:1px solid #ddd;padding:10px;background:#e8f4e8;text-align:left;">Upside levers</th>
              <th style="border:1px solid #ddd;padding:10px;background:#fde8e8;text-align:left;">Downside levers</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }
    }

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
        ${curatedQHtml ? `<hr/><h3>Sector-specific questions</h3>${curatedQHtml}` : ""}
        ${leversHtml}
      `,
    });
  } catch (err) {
    console.error("Brevo notify error (non-fatal):", err);
  }
}

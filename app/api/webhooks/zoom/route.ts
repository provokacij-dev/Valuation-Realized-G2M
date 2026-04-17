import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { runEngagementAnalysis } from "@/lib/engagement-analysis";

// ── Signature verification ───────────────────────────────────────────────────

function verifyZoomSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return false;

  const timestamp = headers.get("x-zm-request-timestamp");
  const signature = headers.get("x-zm-signature");
  if (!timestamp || !signature) return false;

  const message = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + createHmac("sha256", secret).update(message).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Must use text() for HMAC verification
  const rawBody = await request.text();

  let body: {
    event: string;
    payload: {
      plainToken?: string;
      object?: {
        id?: string | number;
        host_email?: string;
        participant_email?: string;
        recording_files?: Array<{ file_type: string; download_url: string }>;
      };
    };
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // URL validation challenge — must handle before signature check (Zoom sends unsigned)
  if (body.event === "endpoint.url_validation") {
    const plainToken = body.payload.plainToken;
    if (!plainToken || !process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
      return NextResponse.json({ error: "Missing config" }, { status: 500 });
    }
    const encryptedToken = createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
      .update(plainToken)
      .digest("hex");
    return NextResponse.json({ plainToken, encryptedToken });
  }

  // All other events require signature verification
  if (!verifyZoomSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.event === "recording.completed") {
    const obj = body.payload.object;
    const transcriptFile = obj?.recording_files?.find(
      (f) => f.file_type === "TRANSCRIPT"
    );
    const transcriptUrl = transcriptFile?.download_url ?? null;
    // Match by Zoom meeting ID — persisted on the engagement at booking time
    // by the Calendly webhook. host_email is always Vaiga's Zoom account and
    // is not a reliable match key.
    const meetingId = obj?.id != null ? String(obj.id) : null;
    const hostEmail = obj?.host_email ?? null;

    if (meetingId) {
      const { data: matches } = await supabase
        .from("engagements")
        .select("id, zoom_analysis")
        .eq("zoom_meeting_id", meetingId)
        .order("scheduled_at", { ascending: false })
        .limit(1);

      if (matches && matches.length > 0) {
        const engagementId = matches[0].id;
        const alreadyAnalysed = matches[0].zoom_analysis != null;

        await supabase
          .from("engagements")
          .update({
            transcript_url: transcriptUrl,
            status: transcriptUrl ? "transcript_pending" : "transcript_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", engagementId);

        // Auto-trigger analysis in the background — webhook returns 200 fast
        // while the Claude + Doc append + Brevo email fan out asynchronously.
        // Skip if this engagement was already analysed (idempotency — Zoom can
        // re-fire recording.completed, e.g. after file migration between cloud
        // and local recording storage).
        if (transcriptUrl && !alreadyAnalysed) {
          waitUntil(
            runEngagementAnalysis(engagementId).catch((err) => {
              console.error("Auto-analysis error (non-fatal):", err);
            }),
          );
        }
      } else {
        // Unmatched meeting ID — store as a safety-net row tagged with the
        // host email so it can be linked to an engagement manually if needed.
        await supabase.from("engagements").insert({
          email: (hostEmail ?? "unknown@unknown.invalid").toLowerCase(),
          status: "unmatched",
          transcript_url: transcriptUrl,
          zoom_meeting_id: meetingId,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}

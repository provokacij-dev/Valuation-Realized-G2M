import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";
import { runEngagementAnalysis } from "@/lib/engagement-analysis";
import { getMeetingParticipants } from "@/lib/zoom";

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

// ── Match the recording back to an engagement ────────────────────────────────

/**
 * Given the meeting context from the Zoom webhook, find the engagement that
 * this recording belongs to.
 *
 * Strategy: prefer matching by invitee email (looked up via Zoom's participants
 * API). Email is more reliable than zoom_meeting_id because it doesn't depend on
 * Calendly's join-URL format being parseable. Fall back to zoom_meeting_id if the
 * participants API call fails (e.g. missing scope, transient error) or yields
 * only the host.
 *
 * Returns null if no engagement matches.
 */
async function matchEngagement(
  meetingUuid: string | null,
  meetingId: string | null,
  hostEmail: string | null,
): Promise<{ id: string } | null> {
  const normalizedHost = (hostEmail ?? "").toLowerCase().trim();

  // 1. Try email match via Zoom participants API.
  if (meetingUuid) {
    try {
      const participants = await getMeetingParticipants(meetingUuid);
      const inviteeEmails = Array.from(
        new Set(
          participants
            .map((p) => (p.user_email ?? "").toLowerCase().trim())
            .filter((e) => e && e !== normalizedHost),
        ),
      );

      if (inviteeEmails.length > 0) {
        const { data } = await supabase
          .from("engagements")
          .select("id")
          .in("email", inviteeEmails)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .limit(1);
        if (data && data.length > 0) return { id: data[0].id };
      }
    } catch (err) {
      console.error("Zoom participants lookup failed (non-fatal, falling back to meeting_id match):", err);
    }
  }

  // 2. Fallback: match by zoom_meeting_id.
  if (meetingId) {
    const { data } = await supabase
      .from("engagements")
      .select("id")
      .eq("zoom_meeting_id", meetingId)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (data && data.length > 0) return { id: data[0].id };
  }

  return null;
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
        uuid?: string;
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
      (f) => f.file_type === "TRANSCRIPT",
    );
    const transcriptUrl = transcriptFile?.download_url ?? null;
    const meetingId = obj?.id != null ? String(obj.id) : null;
    const meetingUuid = obj?.uuid ?? null;
    const hostEmail = obj?.host_email ?? null;

    const matched = await matchEngagement(meetingUuid, meetingId, hostEmail);

    if (matched) {
      const engagementId = matched.id;

      // Idempotency: skip if this engagement was already analysed (Zoom can
      // re-fire recording.completed e.g. after recording storage migration).
      const { data: engagement } = await supabase
        .from("engagements")
        .select("sales_call_doc_id")
        .eq("id", engagementId)
        .single();
      const alreadyAnalysed = engagement?.sales_call_doc_id != null;

      await supabase
        .from("engagements")
        .update({
          transcript_url: transcriptUrl,
          status: transcriptUrl ? "transcript_pending" : "transcript_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", engagementId);

      // Background analysis — webhook returns 200 fast while Claude + Doc + Brevo run async.
      if (transcriptUrl && !alreadyAnalysed) {
        waitUntil(
          runEngagementAnalysis(engagementId).catch((err) => {
            console.error("Auto-analysis error (non-fatal):", err);
          }),
        );
      }
    } else {
      // Unmatched — store a safety-net row tagged with the host email so it can
      // be linked manually if needed.
      await supabase.from("engagements").insert({
        email: (hostEmail ?? "unknown@unknown.invalid").toLowerCase(),
        status: "unmatched",
        transcript_url: transcriptUrl,
        zoom_meeting_id: meetingId,
      });
    }
  }

  return NextResponse.json({ received: true });
}

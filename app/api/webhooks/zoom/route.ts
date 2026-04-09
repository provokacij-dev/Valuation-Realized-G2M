import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";

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
    // Match by host email — participant email would require deeper payload parsing
    const hostEmail = obj?.host_email ?? null;

    if (hostEmail) {
      const { data: matches } = await supabase
        .from("engagements")
        .select("id")
        .eq("email", hostEmail.toLowerCase())
        .in("status", ["booked", "completed"])
        .order("scheduled_at", { ascending: false })
        .limit(1);

      if (matches && matches.length > 0) {
        await supabase
          .from("engagements")
          .update({
            transcript_url: transcriptUrl,
            status: transcriptUrl ? "transcript_pending" : "transcript_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", matches[0].id);
      } else {
        // Unmatched recording — store with email for manual linking
        await supabase.from("engagements").insert({
          email: hostEmail.toLowerCase(),
          status: "unmatched",
          transcript_url: transcriptUrl,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}

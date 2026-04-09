import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enrollInSequence } from "@/lib/brevo";

// Default Brevo list ID for new leads — override via env if needed
const BREVO_LEADS_LIST_ID = parseInt(process.env.BREVO_LEADS_LIST_ID ?? "1", 10);

export async function POST(request: NextRequest) {
  // 1. Authenticate — x-manus-secret header check
  const secret = request.headers.get("x-manus-secret");
  if (!secret || secret !== process.env.MANUS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    email: string;
    phone?: string;
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // 2. Insert lead
  const lead = {
    name: body.name ?? null,
    email: body.email.toLowerCase().trim(),
    phone: body.phone ?? null,
    source: body.source ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    status: "new",
    brevo_list_id: BREVO_LEADS_LIST_ID,
  };

  const { error: dbError } = await supabase.from("leads").insert(lead);
  if (dbError) {
    console.error("Lead insert error:", dbError);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }

  // 3. Enroll in Brevo sequence (non-blocking on failure — lead is already saved)
  try {
    const nameParts = (body.name ?? "").split(" ");
    await enrollInSequence(body.email, BREVO_LEADS_LIST_ID, {
      FIRSTNAME: nameParts[0] ?? undefined,
      LASTNAME: nameParts.slice(1).join(" ") || undefined,
      PHONE: body.phone ?? undefined,
    });
  } catch (err) {
    console.error("Brevo enroll error (non-fatal):", err);
  }

  return NextResponse.json({ success: true });
}

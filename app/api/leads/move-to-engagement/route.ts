import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, email, utm_term, utm_content")
      .eq("id", id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const email = lead.email.toLowerCase();

    const { data: existing, error: existingErr } = await supabase
      .from("engagements")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (existingErr) throw existingErr;

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        engagement_id: existing[0].id,
        already_engaged: true,
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("engagements")
      .insert({
        name: lead.name,
        email,
        status: "booked",
        scheduled_at: null,
        utm_term: lead.utm_term,
        utm_content: lead.utm_content,
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, engagement_id: inserted.id });
  } catch (error) {
    console.error("Move-to-engagement error:", error);
    return NextResponse.json(
      { error: "Failed to move lead to engagement" },
      { status: 500 }
    );
  }
}

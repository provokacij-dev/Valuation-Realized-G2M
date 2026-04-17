import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { LeadStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const [{ data: leads, error }, { data: engagements, error: engErr }] = await Promise.all([
      query,
      supabase.from("engagements").select("email"),
    ]);
    if (error) throw error;
    if (engErr) throw engErr;

    const engagedEmails = new Set(
      (engagements ?? [])
        .map((e) => e.email?.toLowerCase())
        .filter((e): e is string => typeof e === "string" && e.length > 0)
    );

    const filtered = (leads ?? []).filter(
      (l) => !engagedEmails.has((l.email ?? "").toLowerCase())
    );

    return NextResponse.json({ leads: filtered });
  } catch (error) {
    console.error("Leads read error:", error);
    return NextResponse.json({ error: "Failed to read leads" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id: string; status: LeadStatus };

    const { error } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leads update error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("leads").delete().eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leads delete error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}

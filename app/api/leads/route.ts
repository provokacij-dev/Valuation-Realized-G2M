import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ leads: data ?? [] });
  } catch (error) {
    console.error("Leads read error:", error);
    return NextResponse.json({ error: "Failed to read leads" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id: string; status: Lead["status"] };

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

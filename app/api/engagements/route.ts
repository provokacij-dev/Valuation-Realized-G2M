import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Engagement } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("engagements")
      .select("*")
      .order("scheduled_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ engagements: data ?? [] });
  } catch (error) {
    console.error("Engagements read error:", error);
    return NextResponse.json({ error: "Failed to read engagements" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body as Partial<Engagement> & { id: string };

    const { error } = await supabase
      .from("engagements")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Engagement update error:", error);
    return NextResponse.json({ error: "Failed to update engagement" }, { status: 500 });
  }
}

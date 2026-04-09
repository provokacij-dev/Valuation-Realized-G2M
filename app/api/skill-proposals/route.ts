import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "pending";
    const countOnly = searchParams.get("count") === "true";

    if (countOnly) {
      const { count, error } = await supabase
        .from("pending_skill_proposals")
        .select("*", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw error;
      return NextResponse.json({ count: count ?? 0 });
    }

    const { data, error } = await supabase
      .from("pending_skill_proposals")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ proposals: data ?? [] });
  } catch (error) {
    console.error("Skill proposals read error:", error);
    return NextResponse.json({ error: "Failed to read proposals" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id: string; status: "accepted" | "dismissed" };

    const { error } = await supabase
      .from("pending_skill_proposals")
      .update({ status })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Skill proposal update error:", error);
    return NextResponse.json({ error: "Failed to update proposal" }, { status: 500 });
  }
}

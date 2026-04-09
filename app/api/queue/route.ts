import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { GeneratedAd } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fields = searchParams.get("fields");

    // ?fields=list returns only text columns (no SVG/images) for lightweight list views
    const select = fields === "list"
      ? "id,primary_text,headline_a,headline_b,headline_c,description,image_direction,adset_tag,rationale,status,created_at"
      : "*";

    const { data, error } = await supabase
      .from("queue")
      .select(select)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ queue: data ?? [] });
  } catch (error) {
    console.error("Queue read error:", error);
    return NextResponse.json({ error: "Failed to read queue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ad } = body;

    if (action === "add") {
      const { error } = await supabase
        .from("queue")
        .upsert(ad, { onConflict: "id" });
      if (error) throw error;
    } else if (action === "remove") {
      const { error } = await supabase
        .from("queue")
        .delete()
        .eq("id", ad.id);
      if (error) throw error;
    } else if (action === "set") {
      // Replace entire queue: delete all, then insert
      const { error: delErr } = await supabase.from("queue").delete().neq("id", "");
      if (delErr) throw delErr;
      if (body.queue?.length > 0) {
        const { error: insErr } = await supabase.from("queue").insert(body.queue);
        if (insErr) throw insErr;
      }
    } else if (action === "markUploaded") {
      const { error } = await supabase
        .from("queue")
        .update({ status: "uploaded" })
        .eq("id", ad.id);
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from("queue")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ queue: data ?? [] });
  } catch (error) {
    console.error("Queue write error:", error);
    return NextResponse.json({ error: "Failed to update queue" }, { status: 500 });
  }
}

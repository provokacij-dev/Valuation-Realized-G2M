import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("drafts")
      .select("*")
      .order("updated_at", { ascending: true });
    if (error) throw error;
    // Return flat array of GeneratedAd objects (stored in `data` column as JSONB)
    const drafts = (data ?? []).map((row: { id: string; data: object }) => row.data);
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Drafts read error:", error);
    return NextResponse.json({ error: "Failed to read drafts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const now = new Date().toISOString();

    if (action === "set") {
      // Replace all drafts: delete existing, insert new batch
      await supabase.from("drafts").delete().neq("id", "");
      if (body.drafts?.length > 0) {
        const rows = body.drafts.map((ad: { id: string }) => ({
          id: ad.id,
          data: ad,
          updated_at: now,
        }));
        const { error } = await supabase.from("drafts").insert(rows);
        if (error) throw error;
      }
    } else if (action === "add") {
      const ad = body.ad;
      const { error } = await supabase
        .from("drafts")
        .upsert({ id: ad.id, data: ad, updated_at: now }, { onConflict: "id" });
      if (error) throw error;
    } else if (action === "update") {
      const ad = body.ad;
      const { error } = await supabase
        .from("drafts")
        .update({ data: ad, updated_at: now })
        .eq("id", ad.id);
      if (error) throw error;
    } else if (action === "remove") {
      const { error } = await supabase
        .from("drafts")
        .delete()
        .eq("id", body.id);
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from("drafts")
      .select("*")
      .order("updated_at", { ascending: true });
    if (error) throw error;
    const drafts = (data ?? []).map((row: { id: string; data: object }) => row.data);
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Drafts write error:", error);
    return NextResponse.json({ error: "Failed to update drafts" }, { status: 500 });
  }
}

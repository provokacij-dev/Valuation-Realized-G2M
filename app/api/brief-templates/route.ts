import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { BriefTemplate } from "@/types";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("brief_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("Brief templates read error:", error);
    return NextResponse.json({ error: "Failed to read templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, hook_type, target_audience, variant_count, additional_instruction } =
      body as Omit<BriefTemplate, "id" | "created_at">;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("brief_templates")
      .insert({ name: name.trim(), hook_type, target_audience, variant_count, additional_instruction })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error) {
    console.error("Brief template save error:", error);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase.from("brief_templates").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Brief template delete error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}

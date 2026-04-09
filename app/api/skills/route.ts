import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Skill } from "@/types";

async function makeRuleId(): Promise<string> {
  const { data } = await supabase
    .from("skills")
    .select("rule_id")
    .order("rule_id", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return "R001";
  const last = data[0].rule_id as string;
  const num = parseInt(last.replace(/\D/g, ""), 10);
  const next = isNaN(num) ? 1 : num + 1;
  return `R${String(next).padStart(3, "0")}`;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .order("added_date", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Skills read error:", error);
    return NextResponse.json({ error: "Failed to read skills" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, rule_id, category, instruction, evidence, source } = body;
    const now = new Date().toISOString().split("T")[0];

    if (action === "NEW") {
      const newRuleId = rule_id || (await makeRuleId());
      const newSkill: Skill = {
        rule_id: newRuleId,
        category: category || "Copy",
        instruction: instruction || "",
        status: "active",
        added_date: now,
        modified_date: now,
        source: source || "Manual",
        evidence: evidence || "",
      };
      const { error } = await supabase.from("skills").insert(newSkill);
      if (error) throw error;
      return NextResponse.json({ success: true, skill: newSkill });
    }

    if (action === "AMEND") {
      const { error } = await supabase
        .from("skills")
        .update({ instruction, modified_date: now, evidence: evidence || undefined })
        .eq("rule_id", rule_id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "DELETE") {
      const { error } = await supabase
        .from("skills")
        .update({ status: "archived", modified_date: now })
        .eq("rule_id", rule_id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "RESTORE") {
      const { error } = await supabase
        .from("skills")
        .update({ status: "active", modified_date: now })
        .eq("rule_id", rule_id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Skills write error:", error);
    return NextResponse.json({ error: "Failed to update skills" }, { status: 500 });
  }
}

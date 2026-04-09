import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import type { Skill } from "@/types";

export async function GET() {
  try {
    const rows = await getSheetData("Production_Skill");
    if (rows.length < 2) return NextResponse.json([]);

    const [, ...dataRows] = rows;
    const skills: Skill[] = dataRows
      .filter((row) => row.length > 0 && row[0])
      .map((row) => ({
        rule_id: row[0] || "",
        category: (row[1] as Skill["category"]) || "Copy",
        instruction: row[2] || "",
        status: (row[3] as Skill["status"]) || "active",
        added_date: row[4] || "",
        modified_date: row[5] || "",
        source: row[6] || "",
        evidence: row[7] || "",
      }));

    return NextResponse.json(skills);
  } catch (error) {
    console.error("Error fetching skills:", error);
    return NextResponse.json(
      { error: "Couldn't connect to Sheets — check your API credentials" },
      { status: 500 }
    );
  }
}

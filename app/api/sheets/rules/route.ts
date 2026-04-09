import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import type { Rule } from "@/types";

export async function GET() {
  try {
    const rows = await getSheetData("Rules");
    if (rows.length < 2) return NextResponse.json([]);

    const [, ...dataRows] = rows;
    const rules: Rule[] = dataRows
      .filter((row) => row.length > 0 && row[0])
      .map((row) => ({
        rule_id: row[0] || "",
        week: row[1] || "",
        creative_type: row[2] || "",
        hook_angle: row[3] || "",
        geo: row[4] || "",
        cpl: parseFloat(row[5]) || 0,
        ctr: parseFloat(row[6]) || 0,
        booking_rate: parseFloat(row[7]) || 0,
        signal: (row[8] as Rule["signal"]) || "TEST",
        rule_extracted: row[9] || "",
      }));

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Error fetching rules:", error);
    return NextResponse.json(
      { error: "Couldn't connect to Sheets — check your API credentials" },
      { status: 500 }
    );
  }
}

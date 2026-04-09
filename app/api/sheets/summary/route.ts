import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import type { AdSummary } from "@/types";

export async function GET() {
  try {
    const rows = await getSheetData("Summary");
    if (rows.length < 2) return NextResponse.json([]);

    const [, ...dataRows] = rows; // skip header
    const ads: AdSummary[] = dataRows
      .filter((row) => row.length > 0 && row[0])
      .map((row) => ({
        ad_id: row[0] || "",
        ad_name: row[1] || "",
        campaign_name: row[2] || "",
        adset_name: row[3] || "",
        total_spend: parseFloat(row[4]) || 0,
        total_leads: parseInt(row[5]) || 0,
        avg_cpl: parseFloat(row[6]) || 0,
        avg_ctr: parseFloat(row[7]) || 0,
        total_bookings: parseInt(row[8]) || 0,
        booking_rate: parseFloat(row[9]) || 0,
        frequency: parseFloat(row[10]) || 0,
        recommendation: (row[11] as AdSummary["recommendation"]) || "MAINTAIN",
        recommendation_reasoning: row[12] || "",
        alert: row[13] || undefined,
        alert_reason: row[14] || undefined,
        status: (row[15] as AdSummary["status"]) || "active",
      }));

    return NextResponse.json(ads);
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Couldn't connect to Sheets — check your API credentials" },
      { status: 500 }
    );
  }
}
